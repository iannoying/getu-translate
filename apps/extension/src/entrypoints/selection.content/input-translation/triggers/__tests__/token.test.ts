import { describe, expect, it } from "vitest"
import { DEFAULT_TOKEN_LANGS, matchTokenTrigger } from "../token"

const cfg = { prefix: "//", knownLangs: DEFAULT_TOKEN_LANGS }

describe("matchTokenTrigger · happy paths", () => {
  it("matches `hello //en ` → { text:'hello', toLang:'eng' }", () => {
    expect(matchTokenTrigger("hello //en ", cfg)).toEqual({
      text: "hello",
      toLang: "eng",
      consumedSuffix: "//en ",
    })
  })

  it("matches newline terminator: `你好 //en\\n`", () => {
    expect(matchTokenTrigger("你好 //en\n", cfg)).toEqual({
      text: "你好",
      toLang: "eng",
      consumedSuffix: "//en\n",
    })
  })

  it("is case-insensitive on the lang short-code: `foo //EN `", () => {
    expect(matchTokenTrigger("foo //EN ", cfg)?.toLang).toBe("eng")
  })

  it("supports every DEFAULT_TOKEN_LANGS entry", () => {
    for (const [short, canonical] of Object.entries(DEFAULT_TOKEN_LANGS)) {
      expect(matchTokenTrigger(`hi //${short} `, cfg)?.toLang).toBe(canonical)
    }
  })
})

describe("matchTokenTrigger · rejections", () => {
  it("returns null for a plain string without the prefix", () => {
    expect(matchTokenTrigger("plain text", cfg)).toBeNull()
  })

  it("returns null when the lang code is unknown", () => {
    expect(matchTokenTrigger("yo //xx ", cfg)).toBeNull()
  })

  it("returns null when the text portion is empty", () => {
    expect(matchTokenTrigger("//en ", cfg)).toBeNull()
  })

  it("returns null when whitespace sits between prefix and lang: `// en `", () => {
    expect(matchTokenTrigger("foo // en ", cfg)).toBeNull()
  })

  it("returns null when there's no terminator after the lang code", () => {
    expect(matchTokenTrigger("foo //en", cfg)).toBeNull()
  })

  it("returns null when trigger isn't at the very end", () => {
    expect(matchTokenTrigger("foo //en bar", cfg)).toBeNull()
  })

  it("returns null when prefix is empty (misuse guard)", () => {
    expect(matchTokenTrigger("foo en ", { prefix: "", knownLangs: DEFAULT_TOKEN_LANGS })).toBeNull()
  })
})

describe("matchTokenTrigger · custom prefix & langs", () => {
  it("accepts an alternate prefix `++`", () => {
    expect(matchTokenTrigger("hi ++en ", { prefix: "++", knownLangs: DEFAULT_TOKEN_LANGS })).toEqual({
      text: "hi",
      toLang: "eng",
      consumedSuffix: "++en ",
    })
  })

  it("escapes regex metacharacters in the prefix", () => {
    // `$$` is a valid prefix; `$` would be end-of-input in a raw regex.
    expect(matchTokenTrigger("hi $$en ", { prefix: "$$", knownLangs: DEFAULT_TOKEN_LANGS })).toEqual({
      text: "hi",
      toLang: "eng",
      consumedSuffix: "$$en ",
    })
  })

  it("lets callers override the knownLangs map", () => {
    const custom = { klingon: "tlh" }
    expect(matchTokenTrigger("greetings //klingon ", { prefix: "//", knownLangs: custom })).toEqual({
      text: "greetings",
      toLang: "tlh",
      consumedSuffix: "//klingon ",
    })
  })
})
