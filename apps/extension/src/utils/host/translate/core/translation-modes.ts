import type { Config } from "@/types/config/config"
import type { TranslationMode } from "@/types/config/translate"
import type { TransNode } from "@/types/dom"
import {
  CONTENT_WRAPPER_CLASS,
  NOTRANSLATE_CLASS,
  TRANSLATION_MODE_ATTRIBUTE,
  WALKED_ATTRIBUTE,
} from "../../../constants/dom-labels"
import { batchDOMOperation } from "../../dom/batch-dom"
import { isBlockTransNode, isDontWalkIntoAndDontTranslateAsChildElement, isHTMLElement, isTextNode, isTransNode } from "../../dom/filter"
import { unwrapDeepestOnlyHTMLChild } from "../../dom/find"
import { getOwnerDocument } from "../../dom/node"
import { extractTextContent } from "../../dom/traversal"
import { removeTranslatedWrapperWithRestore } from "../dom/translation-cleanup"
import {
  appendTranslatedContent,
  getLinkEndMarker,
  getLinkStartMarker,
  insertTranslatedNodeIntoWrapper,
  isSafeLinkHref,
} from "../dom/translation-insertion"
import { findPreviousTranslatedWrapperInside } from "../dom/translation-wrapper"
import { shouldFilterSmallParagraph } from "../filter-small-paragraph"
import { prepareTranslationText } from "../text-preparation"
import { setTranslationDirAndLang } from "../translation-attributes"
import { createSpinnerInside, getTranslatedTextAndRemoveSpinner } from "../ui/spinner"
import { isNumericContent } from "../ui/translation-utils"
import { MARK_ATTRIBUTES_REGEX, originalContentMap, translatingNodes } from "./translation-state"

const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g

function getDisplayTranslation(sourceText: string, translatedText: string | undefined) {
  if (translatedText === undefined) {
    return undefined
  }

  return prepareTranslationText(sourceText) === prepareTranslationText(translatedText)
    ? ""
    : translatedText
}

function cleanTextContent(content: string): string {
  if (!content)
    return content

  let cleanedContent = content.replace(MARK_ATTRIBUTES_REGEX, "")
  cleanedContent = cleanedContent.replace(HTML_COMMENT_RE, " ")

  return cleanedContent
}

function hasSafeLink(nodes: TransNode[]): boolean {
  return nodes.some((node) => {
    if (!isHTMLElement(node))
      return false

    const nodeAndDescendants = [
      node,
      ...node.querySelectorAll<HTMLElement>("a[href]"),
    ]

    return nodeAndDescendants.some(candidate =>
      candidate.tagName === "A" && candidate.hasAttribute("href") && isSafeLinkHref(candidate),
    )
  })
}

function hasAnyLink(nodes: TransNode[]): boolean {
  return nodes.some((node) => {
    if (!isHTMLElement(node))
      return false

    return (node.tagName === "A" && node.hasAttribute("href")) || !!node.querySelector("a[href]")
  })
}

function getStringFormatFromNode(node: Element | Text) {
  if (isTextNode(node)) {
    return node.textContent
  }
  return node.outerHTML
}

function extractTextContentWithLinkMarkers(node: TransNode, config: Config, linkIndexRef: { value: number }): string {
  if (isTextNode(node)) {
    return extractTextContent(node, config)
  }

  if (isDontWalkIntoAndDontTranslateAsChildElement(node, config)) {
    return ""
  }

  if (node.tagName === "BR") {
    return "\n"
  }

  if (node.tagName === "A" && node.hasAttribute("href") && isSafeLinkHref(node)) {
    const linkIndex = linkIndexRef.value++
    const linkText = [...node.childNodes].reduce((text: string, child: ChildNode) => {
      if (isTextNode(child) || isHTMLElement(child))
        return text + extractTextContent(child, config)
      return text
    }, "")
    return `${getLinkStartMarker(linkIndex)}${linkText}${getLinkEndMarker(linkIndex)}`
  }

  const childNodes = [...node.childNodes]
  return childNodes.reduce((text: string, child: ChildNode) => {
    if (isTextNode(child) || isHTMLElement(child)) {
      return text + extractTextContentWithLinkMarkers(child, config, linkIndexRef)
    }
    return text
  }, "")
}

function getBilingualTranslationSource(transNodes: TransNode[], config: Config, plainTextContent: string): string {
  if (!hasSafeLink(transNodes))
    return plainTextContent

  return getLinkMarkerTranslationSource(transNodes, config, plainTextContent)
}

function getLinkMarkerTranslationSource(transNodes: TransNode[], config: Config, fallbackTextContent: string): string {
  const linkIndexRef = { value: 0 }
  const markerTextContent = transNodes.map(node => extractTextContentWithLinkMarkers(node, config, linkIndexRef)).join("").trim()

  return markerTextContent || fallbackTextContent
}

function getTranslationOnlyTranslationSource(transNodes: TransNode[], config: Config, htmlContent: string, plainTextContent: string): string {
  if (!hasAnyLink(transNodes))
    return htmlContent

  return getLinkMarkerTranslationSource(transNodes, config, plainTextContent)
}

export async function translateNodes(
  nodes: ChildNode[],
  walkId: string,
  toggle: boolean = false,
  config: Config,
  forceBlockTranslation: boolean = false,
): Promise<void> {
  const translationMode = config.translate.mode
  if (translationMode === "translationOnly") {
    await translateNodeTranslationOnlyMode(nodes, walkId, config, toggle)
  }
  else if (translationMode === "bilingual") {
    await translateNodesBilingualMode(nodes, walkId, config, toggle, forceBlockTranslation)
  }
}

export async function translateNodesBilingualMode(
  nodes: ChildNode[],
  walkId: string,
  config: Config,
  toggle: boolean = false,
  forceBlockTranslation: boolean = false,
): Promise<void> {
  const transNodes = nodes.filter(node => isTransNode(node))
  if (transNodes.length === 0) {
    return
  }
  try {
    // prevent duplicate translation
    if (transNodes.every(node => translatingNodes.has(node))) {
      return
    }
    transNodes.forEach(node => translatingNodes.add(node))

    const lastNode = transNodes.at(-1)!
    const targetNode
      = transNodes.length === 1 && isBlockTransNode(lastNode) && isHTMLElement(lastNode)
        ? await unwrapDeepestOnlyHTMLChild(lastNode)
        : lastNode

    const existedTranslatedWrapper = findPreviousTranslatedWrapperInside(targetNode, walkId)
    if (existedTranslatedWrapper) {
      removeTranslatedWrapperWithRestore(existedTranslatedWrapper)
      if (toggle) {
        return
      }
      else {
        nodes.forEach(node => translatingNodes.delete(node))
        void translateNodesBilingualMode(nodes, walkId, config, toggle)
        return
      }
    }

    const plainTextContent = transNodes.map(node => extractTextContent(node, config)).join("").trim()
    if (!plainTextContent || isNumericContent(plainTextContent))
      return

    if (await shouldFilterSmallParagraph(plainTextContent, config))
      return

    const textContent = getBilingualTranslationSource(transNodes, config, plainTextContent)

    const ownerDoc = getOwnerDocument(targetNode)
    const translatedWrapperNode = ownerDoc.createElement("span")
    translatedWrapperNode.className = `${NOTRANSLATE_CLASS} ${CONTENT_WRAPPER_CLASS}`
    translatedWrapperNode.setAttribute(TRANSLATION_MODE_ATTRIBUTE, "bilingual" satisfies TranslationMode)
    translatedWrapperNode.setAttribute(WALKED_ATTRIBUTE, walkId)
    setTranslationDirAndLang(translatedWrapperNode, config)
    const spinner = createSpinnerInside(translatedWrapperNode)

    // Batch DOM insertion to reduce layout thrashing
    const insertOperation = () => {
      if (isTextNode(targetNode) || transNodes.length > 1) {
        targetNode.parentNode?.insertBefore(
          translatedWrapperNode,
          targetNode.nextSibling,
        )
      }
      else {
        targetNode.appendChild(translatedWrapperNode)
      }
    }
    batchDOMOperation(insertOperation)

    const realTranslatedText = await getTranslatedTextAndRemoveSpinner(nodes, textContent, spinner, translatedWrapperNode)

    const translatedText = getDisplayTranslation(textContent, realTranslatedText)

    if (!translatedText) {
      // Only remove wrapper if translation returned empty (not needed),
      // but keep it for error display (undefined)
      if (translatedText === "") {
        // Batch the remove operation to execute remove operation after insert operation
        batchDOMOperation(() => translatedWrapperNode.remove())
      }
      return
    }

    await insertTranslatedNodeIntoWrapper(
      translatedWrapperNode,
      targetNode,
      translatedText,
      config.translate.translationNodeStyle,
      forceBlockTranslation,
      transNodes,
      config,
    )
  }
  finally {
    transNodes.forEach(node => translatingNodes.delete(node))
  }
}

export async function translateNodeTranslationOnlyMode(
  nodes: ChildNode[],
  walkId: string,
  config: Config,
  toggle: boolean = false,
): Promise<void> {
  const isTransNodeAndNotTranslatedWrapper = (node: Node): node is TransNode => {
    if (isHTMLElement(node) && node.classList.contains(CONTENT_WRAPPER_CLASS))
      return false
    return isTransNode(node)
  }

  const outerTransNodes = nodes.filter(isTransNode)
  if (outerTransNodes.length === 0) {
    return
  }

  // snapshot the outer parent element, to prevent lose it if we go to deeper by unwrapDeepestOnlyHTMLChild
  // test case is:
  // <div data-testid="test-node">
  //   <span style={{ display: 'inline' }}>原文</span> // get the outer parent snapshot before go to inner element
  //   <br />
  //   <span style={{ display: 'inline' }}>原文</span>
  //   原文
  //   <br />
  //   <span style={{ display: 'inline' }}>原文</span>
  // </div>,
  // Only save originalContent when there's no existing translation wrapper
  // If wrapper exists, we're removing translation and should restore from saved content
  const outerParentElement = outerTransNodes[0].parentElement
  const hasExistingWrapper = outerParentElement?.querySelector(`.${CONTENT_WRAPPER_CLASS}`)
  if (outerParentElement && !originalContentMap.has(outerParentElement) && !hasExistingWrapper) {
    originalContentMap.set(outerParentElement, outerParentElement.innerHTML)
  }

  let transNodes: TransNode[] = []
  let allChildNodes: ChildNode[] = []
  if (outerTransNodes.length === 1 && isHTMLElement(outerTransNodes[0])) {
    const unwrappedHTMLChild = await unwrapDeepestOnlyHTMLChild(outerTransNodes[0])
    allChildNodes = [...unwrappedHTMLChild.childNodes]
    transNodes = allChildNodes.filter(isTransNodeAndNotTranslatedWrapper)
  }
  else {
    transNodes = outerTransNodes
    allChildNodes = nodes
  }

  if (transNodes.length === 0) {
    return
  }

  try {
    if (nodes.every(node => translatingNodes.has(node))) {
      return
    }
    nodes.forEach(node => translatingNodes.add(node))

    const targetNode = transNodes.at(-1)!

    const parentNode = targetNode.parentElement
    if (!parentNode) {
      console.error("targetNode.parentElement is not HTMLElement", targetNode.parentElement)
      return
    }
    const existedTranslatedWrapper = findPreviousTranslatedWrapperInside(targetNode.parentElement, walkId)
    const existedTranslatedWrapperOutside = targetNode.parentElement.closest(`.${CONTENT_WRAPPER_CLASS}`)

    const finalTranslatedWrapper = existedTranslatedWrapperOutside ?? existedTranslatedWrapper
    if (finalTranslatedWrapper && isHTMLElement(finalTranslatedWrapper)) {
      removeTranslatedWrapperWithRestore(finalTranslatedWrapper)
      if (toggle) {
        return
      }
      else {
        // In translationOnly mode, removeTranslatedWrapperWithRestore uses innerHTML to restore content,
        // which destroys the original DOM nodes and creates new ones. The 'nodes' array still references
        // the old detached nodes, and targetNode can't reference to the new dom added by innerHTML anymore.
        // Therefore, by recursively calling translateNodeTranslationOnlyMode here with the
        // same nodes array, we ensure the translation uses the newly created DOM elements since the
        // function will re-query and find the correct parent and child nodes from the restored DOM.
        nodes.forEach(node => translatingNodes.delete(node))
        void translateNodeTranslationOnlyMode(nodes, walkId, config, toggle)
        return
      }
    }

    const innerTextContent = transNodes.map(node => extractTextContent(node, config)).join("")
    if (!innerTextContent.trim() || isNumericContent(innerTextContent))
      return

    if (await shouldFilterSmallParagraph(innerTextContent, config))
      return

    // Only save originalContent when there's no existing translation wrapper
    const hasExistingWrapperInParent = parentNode.querySelector(`.${CONTENT_WRAPPER_CLASS}`)
    if (!originalContentMap.has(parentNode) && !hasExistingWrapperInParent) {
      originalContentMap.set(parentNode, parentNode.innerHTML)
    }

    const translationSourceNodes = hasSafeLink(outerTransNodes) ? outerTransNodes : transNodes
    const textContent = getTranslationOnlyTranslationSource(
      translationSourceNodes,
      config,
      cleanTextContent(transNodes.map(getStringFormatFromNode).join("")),
      innerTextContent.trim(),
    )
    if (!textContent)
      return

    const ownerDoc = getOwnerDocument(targetNode)
    const translatedWrapperNode = ownerDoc.createElement("span")
    translatedWrapperNode.className = `${NOTRANSLATE_CLASS} ${CONTENT_WRAPPER_CLASS}`
    translatedWrapperNode.setAttribute(TRANSLATION_MODE_ATTRIBUTE, "translationOnly" satisfies TranslationMode)
    translatedWrapperNode.setAttribute(WALKED_ATTRIBUTE, walkId)
    translatedWrapperNode.style.display = "contents"
    setTranslationDirAndLang(translatedWrapperNode, config)
    const spinner = createSpinnerInside(translatedWrapperNode)

    // Batch DOM insertion to reduce layout thrashing
    const insertOperation = () => {
      if (isTextNode(targetNode) || transNodes.length > 1) {
        targetNode.parentNode?.insertBefore(
          translatedWrapperNode,
          targetNode.nextSibling,
        )
      }
      else {
        targetNode.appendChild(translatedWrapperNode)
      }
    }
    batchDOMOperation(insertOperation)

    const realTranslatedText = await getTranslatedTextAndRemoveSpinner(nodes, textContent, spinner, translatedWrapperNode)
    const translatedText = realTranslatedText ? getDisplayTranslation(textContent, realTranslatedText) : realTranslatedText

    if (!translatedText) {
      // Keep the wrapper when translation failed so the injected error UI remains visible.
      // Only remove the wrapper when translation returned an empty string.
      if (translatedText === "") {
        // Batch the remove operation to execute remove operation after insert operation
        batchDOMOperation(() => translatedWrapperNode.remove())
      }
      return
    }

    const shouldReuseAncestorLink = targetNode.parentElement?.closest("a[href]")
    appendTranslatedContent(ownerDoc, translatedWrapperNode, translatedText, shouldReuseAncestorLink ? [] : outerTransNodes, config)

    // Batch final DOM mutations to reduce layout thrashing
    batchDOMOperation(() => {
      // Insert translated content after the last node
      const lastChildNode = allChildNodes.at(-1)!
      lastChildNode.parentNode?.insertBefore(translatedWrapperNode, lastChildNode.nextSibling)

      // Remove all original nodes
      allChildNodes.forEach(childNode => childNode.remove())
    })
  }
  finally {
    nodes.forEach(node => translatingNodes.delete(node))
  }
}
