import type { PlatformHandler } from "../registry"
import { describe, expect, it } from "vitest"
import { bilibiliHandler } from "../bilibili/handler"
import { createPlatformRegistry } from "../registry"
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
})
