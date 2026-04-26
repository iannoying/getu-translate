// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { sourceLangCodeAtom, targetLangCodeAtom, translateRequestAtom } from "../../atoms"
import { TextInput } from "../text-input"

function renderTextInput() {
  const store = createStore()
  store.set(sourceLangCodeAtom, "eng")
  store.set(targetLangCodeAtom, "cmn")

  return {
    store,
    ...render(
      <JotaiProvider store={store}>
        <TextInput />
      </JotaiProvider>,
    ),
  }
}

function enterText(value: string) {
  fireEvent.change(screen.getByPlaceholderText("translationHub.inputPlaceholder"), {
    target: { value },
  })
}

function clickTranslate() {
  fireEvent.click(screen.getByRole("button", { name: /translationHub\.translate/ }))
}

describe("translation hub TextInput", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("stores a fresh clickId on each translate click", () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce("click-1")
      .mockReturnValueOnce("click-2")
    vi.stubGlobal("crypto", { randomUUID })

    const { store } = renderTextInput()

    enterText("Hello")
    clickTranslate()

    expect(store.get(translateRequestAtom)).toMatchObject({
      inputText: "Hello",
      sourceLanguage: "eng",
      targetLanguage: "cmn",
      clickId: "click-1",
    })

    clickTranslate()

    expect(store.get(translateRequestAtom)).toMatchObject({
      inputText: "Hello",
      sourceLanguage: "eng",
      targetLanguage: "cmn",
      clickId: "click-2",
    })
    expect(randomUUID).toHaveBeenCalledTimes(2)
  })

  it("falls back to a local clickId when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {})
    vi.spyOn(Date, "now").mockReturnValue(1234567890)
    vi.spyOn(Math, "random").mockReturnValue(0.5)

    const { store } = renderTextInput()

    enterText("Hello")
    clickTranslate()

    expect(store.get(translateRequestAtom)?.clickId).toMatch(/^1234567890:/)
  })
})
