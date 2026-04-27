import type { Config } from "@/types/config/config"
import type { TranslationNodeStyleConfig } from "@/types/config/translate"
import type { TransNode } from "@/types/dom"
import {
  BLOCK_CONTENT_CLASS,
  FLOAT_WRAP_ATTRIBUTE,
  INLINE_CONTENT_CLASS,
  NOTRANSLATE_CLASS,
  PARAGRAPH_ATTRIBUTE,
} from "../../../constants/dom-labels"
import { isBlockTransNode, isCustomForceBlockTranslation, isDontWalkIntoAndDontTranslateAsChildElement, isHTMLElement, isInlineTransNode } from "../../dom/filter"
import { getOwnerDocument } from "../../dom/node"
import { decorateTranslationNode } from "../ui/decorate-translation"
import { isForceInlineTranslation } from "../ui/translation-utils"

function isFloatedElement(element: HTMLElement): boolean {
  const floatValue = window.getComputedStyle(element).float
  return floatValue === "left" || floatValue === "right"
}

function hasVisibleLayoutBox(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function findActiveFloatSibling(paragraphElement: HTMLElement): HTMLElement | null {
  const flowContainer = paragraphElement.parentElement
  if (!flowContainer)
    return null

  const paragraphRect = paragraphElement.getBoundingClientRect()

  for (const sibling of flowContainer.children) {
    if (!isHTMLElement(sibling))
      continue
    if (sibling === paragraphElement || sibling.contains(paragraphElement))
      continue

    const floatCandidates = [sibling, ...sibling.querySelectorAll<HTMLElement>("*")]
    for (const candidate of floatCandidates) {
      if (!isFloatedElement(candidate) || !hasVisibleLayoutBox(candidate))
        continue

      const floatRect = candidate.getBoundingClientRect()
      const verticallyAffectsParagraph = paragraphRect.top < floatRect.bottom - 1 && paragraphRect.bottom > floatRect.top + 1
      if (verticallyAffectsParagraph)
        return candidate
    }
  }

  return null
}

function shouldWrapInsideFloatFlow(targetNode: TransNode): boolean {
  const paragraphElement = isHTMLElement(targetNode)
    ? (targetNode.hasAttribute(PARAGRAPH_ATTRIBUTE) ? targetNode : targetNode.closest<HTMLElement>(`[${PARAGRAPH_ATTRIBUTE}]`))
    : targetNode.parentElement?.closest<HTMLElement>(`[${PARAGRAPH_ATTRIBUTE}]`)
  if (!paragraphElement)
    return false

  const activeFloat = findActiveFloatSibling(paragraphElement)
  return !!activeFloat
}

const SAFE_LINK_TARGETS = new Set(["_blank", "_self", "_parent", "_top"])
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"])
const REL_TOKEN_RE = /^[\w-]+$/
const SITE_METADATA_RE = /^[\s()[\]{}.,:;|/\\-]*[a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,}[\s()[\]{}.,:;|/\\-]*$/i
const PUNCTUATION_METADATA_RE = /^[\s()[\]{}.,:;|/\\-]*$/
const LINK_MARKER_RE = /\[\[GETU_LINK_\d+_(?:START|END)\]\]/g
const LINK_START_MARKER_RE = /\[\[GETU_LINK_(\d+)_START\]\]/g
const DROP_CONTENT_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "SVG", "MATH", "TEMPLATE"])
const SAFE_TRANSLATED_TAGS = new Set([
  "ABBR",
  "B",
  "BLOCKQUOTE",
  "BR",
  "CITE",
  "CODE",
  "DEL",
  "DIV",
  "EM",
  "I",
  "INS",
  "KBD",
  "LI",
  "MARK",
  "OL",
  "P",
  "PRE",
  "Q",
  "RP",
  "RT",
  "RUBY",
  "S",
  "SAMP",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "U",
  "UL",
  "VAR",
])

export function getLinkStartMarker(index: number): string {
  return `[[GETU_LINK_${index}_START]]`
}

export function getLinkEndMarker(index: number): string {
  return `[[GETU_LINK_${index}_END]]`
}

export function isSafeLinkHref(source: HTMLElement): boolean {
  const href = source.getAttribute("href")
  if (!href)
    return false

  if (href.trim().startsWith("#"))
    return true

  try {
    const url = new URL(href, source.ownerDocument.baseURI)
    return SAFE_LINK_PROTOCOLS.has(url.protocol)
  }
  catch {
    return false
  }
}

function copyLinkAttributes(source: HTMLElement, target: HTMLElement): void {
  const href = source.getAttribute("href")
  if (href)
    target.setAttribute("href", href)

  const targetValue = source.getAttribute("target")
  if (targetValue && SAFE_LINK_TARGETS.has(targetValue)) {
    target.setAttribute("target", targetValue)
  }

  const relTokens = (source.getAttribute("rel") ?? "")
    .split(/\s+/)
    .filter(token => REL_TOKEN_RE.test(token))

  if (targetValue === "_blank") {
    relTokens.push("noopener", "noreferrer")
  }

  const rel = [...new Set(relTokens)].join(" ")
  if (rel) {
    target.setAttribute("rel", rel)
  }

  const title = source.getAttribute("title")
  if (title) {
    target.setAttribute("title", title)
  }

  const ariaLabel = source.getAttribute("aria-label")
  if (ariaLabel) {
    target.setAttribute("aria-label", ariaLabel)
  }
}

function isHiddenLinkCandidate(candidate: HTMLElement, roots: HTMLElement[], config?: Config): boolean {
  let current: HTMLElement | null = candidate

  while (current) {
    const style = window.getComputedStyle(current)
    const isHidden = current.hidden
      || current.getAttribute("aria-hidden") === "true"
      || current.classList.contains("sr-only")
      || current.classList.contains("visually-hidden")
      || style.display === "none"
      || style.visibility === "hidden"

    if (isHidden)
      return true

    if (config && isDontWalkIntoAndDontTranslateAsChildElement(current, config))
      return true

    if (roots.includes(current))
      return false

    current = current.parentElement
  }

  return false
}

function getSafeSourceLinks(nodes: TransNode[], config?: Config): HTMLElement[] {
  const links: HTMLElement[] = []
  const rootElements = nodes.filter(isHTMLElement)

  for (const node of nodes) {
    if (!isHTMLElement(node))
      continue

    const nodeAndDescendants = [
      node,
      ...node.querySelectorAll<HTMLElement>("a[href]"),
    ]

    for (const candidate of nodeAndDescendants) {
      if (
        candidate.tagName === "A"
        && candidate.hasAttribute("href")
        && isSafeLinkHref(candidate)
        && !isHiddenLinkCandidate(candidate, rootElements, config)
      ) {
        links.push(candidate)
      }
    }
  }

  return [...new Set(links)]
}

function hasHTMLMarkup(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content)
}

function stripLinkMarkers(text: string): string {
  return text.replace(LINK_MARKER_RE, "")
}

function appendMarkedTranslatedContent(
  ownerDoc: Document,
  translatedNode: HTMLElement,
  translatedText: string,
  sourceLinks: HTMLElement[],
): boolean {
  if (translatedNode.tagName === "A" || !translatedText.includes("[[GETU_LINK_"))
    return false

  let cursor = 0
  LINK_START_MARKER_RE.lastIndex = 0

  for (const match of translatedText.matchAll(LINK_START_MARKER_RE)) {
    const marker = match[0]
    const index = Number(match[1])
    const startIndex = match.index ?? 0
    const endMarker = getLinkEndMarker(index)
    const linkTextStart = startIndex + marker.length
    const endIndex = translatedText.indexOf(endMarker, linkTextStart)

    translatedNode.appendChild(ownerDoc.createTextNode(stripLinkMarkers(translatedText.slice(cursor, startIndex))))

    if (endIndex === -1) {
      translatedNode.appendChild(ownerDoc.createTextNode(stripLinkMarkers(translatedText.slice(startIndex))))
      return true
    }

    const linkText = stripLinkMarkers(translatedText.slice(linkTextStart, endIndex))
    const sourceLink = sourceLinks[index]
    if (sourceLink) {
      const translatedLink = ownerDoc.createElement("a")
      copyLinkAttributes(sourceLink, translatedLink)
      translatedLink.textContent = linkText
      translatedNode.appendChild(translatedLink)
    }
    else {
      translatedNode.appendChild(ownerDoc.createTextNode(linkText))
    }

    cursor = endIndex + endMarker.length
  }

  translatedNode.appendChild(ownerDoc.createTextNode(stripLinkMarkers(translatedText.slice(cursor))))
  return true
}

function appendSanitizedElementChildren(ownerDoc: Document, sourceParent: ParentNode, targetParent: Node, sourceLinks: HTMLElement[], linkIndexRef: { value: number }): void {
  for (const child of [...sourceParent.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) {
      targetParent.appendChild(ownerDoc.createTextNode(stripLinkMarkers(child.textContent ?? "")))
      continue
    }

    if (!isHTMLElement(child))
      continue

    if (DROP_CONTENT_TAGS.has(child.tagName))
      continue

    if (child.tagName === "A") {
      const sourceLink = sourceLinks[linkIndexRef.value++]
      if (!sourceLink) {
        appendSanitizedElementChildren(ownerDoc, child, targetParent, sourceLinks, linkIndexRef)
        continue
      }

      const translatedLink = ownerDoc.createElement("a")
      copyLinkAttributes(sourceLink, translatedLink)
      appendSanitizedElementChildren(ownerDoc, child, translatedLink, sourceLinks, linkIndexRef)
      targetParent.appendChild(translatedLink)
      continue
    }

    if (child.tagName === "BR") {
      targetParent.appendChild(ownerDoc.createElement("br"))
      continue
    }

    if (!SAFE_TRANSLATED_TAGS.has(child.tagName)) {
      appendSanitizedElementChildren(ownerDoc, child, targetParent, sourceLinks, linkIndexRef)
      continue
    }

    const safeElement = ownerDoc.createElement(child.tagName.toLowerCase())
    appendSanitizedElementChildren(ownerDoc, child, safeElement, sourceLinks, linkIndexRef)
    targetParent.appendChild(safeElement)
  }
}

function appendSanitizedTranslatedContent(
  ownerDoc: Document,
  translatedNode: HTMLElement,
  translatedText: string,
  sourceLinks: HTMLElement[],
): boolean {
  if (translatedNode.tagName === "A" || !hasHTMLMarkup(translatedText))
    return false

  const template = ownerDoc.createElement("template")
  template.innerHTML = translatedText
  appendSanitizedElementChildren(ownerDoc, template.content, translatedNode, sourceLinks, { value: 0 })
  return true
}

export function appendTranslatedContent(
  ownerDoc: Document,
  translatedNode: HTMLElement,
  translatedText: string,
  sourceNodes: TransNode[],
  config?: Config,
): void {
  const sourceLinks = getSafeSourceLinks(sourceNodes, config)
  const didAppendRichContent = appendMarkedTranslatedContent(ownerDoc, translatedNode, translatedText, sourceLinks)
    || appendSanitizedTranslatedContent(ownerDoc, translatedNode, translatedText, sourceLinks)

  if (!didAppendRichContent) {
    translatedNode.textContent = stripLinkMarkers(translatedText)

    if (translatedNode.tagName !== "A" && sourceLinks.length > 0) {
      translatedNode.appendChild(ownerDoc.createTextNode(" "))

      for (const sourceLink of sourceLinks) {
        const fallbackLink = ownerDoc.createElement("a")
        copyLinkAttributes(sourceLink, fallbackLink)
        fallbackLink.textContent = sourceLink.textContent?.trim() || sourceLink.getAttribute("href") || ""
        translatedNode.appendChild(fallbackLink)
        translatedNode.appendChild(ownerDoc.createTextNode(" "))
      }
    }
  }
}

function isLinkMetadataText(text: string): boolean {
  const trimmed = text.trim()
  return !trimmed || PUNCTUATION_METADATA_RE.test(trimmed) || SITE_METADATA_RE.test(trimmed)
}

function findProminentLink(targetNode: TransNode): HTMLElement | null {
  if (!isHTMLElement(targetNode))
    return null

  if (targetNode.closest("a[href]"))
    return null

  const links = [...targetNode.querySelectorAll<HTMLElement>("a[href]")]
  if (links.length !== 1)
    return null

  if (!isSafeLinkHref(links[0]))
    return null

  const linkText = links[0].textContent?.trim() ?? ""
  if (!linkText)
    return null

  const clone = targetNode.cloneNode(true)
  if (!isHTMLElement(clone))
    return null
  clone.querySelectorAll("a[href]").forEach(link => link.remove())

  if (!isLinkMetadataText(clone.textContent ?? ""))
    return null

  return links[0]
}

function createTranslatedNode(ownerDoc: Document, targetNode: TransNode): HTMLElement {
  const sourceLink = findProminentLink(targetNode)
  if (sourceLink) {
    const translatedLink = ownerDoc.createElement("a")
    copyLinkAttributes(sourceLink, translatedLink)
    return translatedLink
  }

  return ownerDoc.createElement("span")
}

export function addInlineTranslation(ownerDoc: Document, translatedWrapperNode: HTMLElement, translatedNode: HTMLElement): void {
  const spaceNode = ownerDoc.createElement("span")
  spaceNode.textContent = "  "
  translatedWrapperNode.appendChild(spaceNode)
  translatedNode.className = `${NOTRANSLATE_CLASS} ${INLINE_CONTENT_CLASS}`
}

export function addBlockTranslation(ownerDoc: Document, translatedWrapperNode: HTMLElement, translatedNode: HTMLElement): void {
  const brNode = ownerDoc.createElement("br")
  translatedWrapperNode.appendChild(brNode)
  translatedNode.className = `${NOTRANSLATE_CLASS} ${BLOCK_CONTENT_CLASS}`
}

export async function insertTranslatedNodeIntoWrapper(
  translatedWrapperNode: HTMLElement,
  targetNode: TransNode,
  translatedText: string,
  translationNodeStyle: TranslationNodeStyleConfig,
  forceBlockTranslation: boolean = false,
  sourceNodes: TransNode[] = [targetNode],
  config?: Config,
): Promise<void> {
  // Use the wrapper's owner document
  const ownerDoc = getOwnerDocument(translatedWrapperNode)
  const translatedNode = createTranslatedNode(ownerDoc, targetNode)
  const forceInlineTranslation = isForceInlineTranslation(targetNode)
  const customForceBlock = isHTMLElement(targetNode) && isCustomForceBlockTranslation(targetNode)

  // priority: customForceBlock > forceInlineTranslation > forceBlockTranslation > isInlineTransNode > isBlockTransNode
  if (customForceBlock) {
    addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  }
  else if (forceInlineTranslation) {
    addInlineTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  }
  else if (forceBlockTranslation) {
    addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  }
  else if (isInlineTransNode(targetNode)) {
    addInlineTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  }
  else if (isBlockTransNode(targetNode)) {
    addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  }
  else {
    // not inline or block, maybe notranslate
    return
  }

  appendTranslatedContent(
    ownerDoc,
    translatedNode,
    translatedText,
    isHTMLElement(targetNode) && targetNode.closest("a[href]") ? [] : sourceNodes,
    config,
  )
  translatedWrapperNode.appendChild(translatedNode)
  await decorateTranslationNode(translatedNode, translationNodeStyle)

  if (translatedNode.classList.contains(BLOCK_CONTENT_CLASS) && shouldWrapInsideFloatFlow(targetNode)) {
    translatedNode.setAttribute(FLOAT_WRAP_ATTRIBUTE, "true")
  }
}
