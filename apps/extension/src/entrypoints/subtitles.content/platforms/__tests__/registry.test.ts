import type { PlatformHandler } from "../registry"
import { describe, expect, it } from "vitest"
import { bilibiliHandler } from "../bilibili/handler"
import { createPlatformRegistry } from "../registry"
import { tedHandler } from "../ted/handler"
import { xHandler } from "../x/handler"
import { youtubeHandler } from "../youtube/handler"

function makeHandler(kind: string, pattern: RegExp): PlatformHandler {
  return {
    kind,
    matches: hostname => pattern.test(hostname),
    init: () => {},
  }
}

describe("platformRegistry", () => {
  it("round-trips registered handlers via list()", () => {
    const registry = createPlatformRegistry()
    const a = makeHandler("a", /a\.com$/)
    const b = makeHandler("b", /b\.com$/)

    registry.register(a)
    registry.register(b)

    expect(registry.list()).toEqual([a, b])
  })

  it("dispatch() finds the matching handler by hostname", () => {
    const registry = createPlatformRegistry()
    const yt = makeHandler("youtube", /youtube\.com$/)
    const bili = makeHandler("bilibili", /bilibili\.com$/)
    registry.register(yt)
    registry.register(bili)

    expect(registry.dispatch("www.youtube.com")).toBe(yt)
    expect(registry.dispatch("www.bilibili.com")).toBe(bili)
  })

  it("dispatch() returns null when no handler matches", () => {
    const registry = createPlatformRegistry()
    registry.register(makeHandler("youtube", /youtube\.com$/))

    expect(registry.dispatch("example.com")).toBeNull()
  })

  it("first registered handler wins when multiple match", () => {
    const registry = createPlatformRegistry()
    const first = makeHandler("first", /example\.com$/)
    const second = makeHandler("second", /example\.com$/)

    registry.register(first)
    registry.register(second)

    expect(registry.dispatch("www.example.com")).toBe(first)
  })

  it("dispatches www.youtube.com to the youtube handler", () => {
    const registry = createPlatformRegistry()
    registry.register(youtubeHandler)

    expect(registry.dispatch("www.youtube.com")).toBe(youtubeHandler)
    expect(registry.dispatch("youtube.com")).toBe(youtubeHandler)
    expect(registry.dispatch("m.youtube.com")).toBe(youtubeHandler)
    expect(registry.dispatch("example.com")).toBeNull()
    expect(youtubeHandler.kind).toBe("youtube")
  })

  it("dispatches www.bilibili.com to the bilibili handler", () => {
    const registry = createPlatformRegistry()
    registry.register(bilibiliHandler)

    expect(registry.dispatch("www.bilibili.com")).toBe(bilibiliHandler)
    expect(registry.dispatch("bilibili.com")).toBe(bilibiliHandler)
    expect(registry.dispatch("m.bilibili.com")).toBe(bilibiliHandler)
    expect(registry.dispatch("t.bilibili.com")).toBe(bilibiliHandler)
    expect(registry.dispatch("example.com")).toBeNull()
    expect(bilibiliHandler.kind).toBe("bilibili")
  })

  it("dispatches www.ted.com to the ted handler", () => {
    const registry = createPlatformRegistry()
    registry.register(tedHandler)

    expect(registry.dispatch("www.ted.com")).toBe(tedHandler)
    expect(registry.dispatch("ted.com")).toBe(tedHandler)
    expect(registry.dispatch("embed.ted.com")).toBe(tedHandler)
    expect(registry.dispatch("example.com")).toBeNull()
    expect(tedHandler.kind).toBe("ted")
  })

  it("dispatches both twitter.com and x.com to the x handler", () => {
    const registry = createPlatformRegistry()
    registry.register(xHandler)

    expect(registry.dispatch("twitter.com")).toBe(xHandler)
    expect(registry.dispatch("www.twitter.com")).toBe(xHandler)
    expect(registry.dispatch("mobile.twitter.com")).toBe(xHandler)
    expect(registry.dispatch("x.com")).toBe(xHandler)
    expect(registry.dispatch("www.x.com")).toBe(xHandler)
    expect(registry.dispatch("mobile.x.com")).toBe(xHandler)
    expect(registry.dispatch("example.com")).toBeNull()
    expect(xHandler.kind).toBe("x")
  })
})
