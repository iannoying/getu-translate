import { describe, it, expect } from "vitest"
import { runColumnTranslations } from "../translate-orchestrator"

describe("runColumnTranslations", () => {
  it("aborts in-flight calls when AbortSignal fires", async () => {
    const aborted: string[] = []
    const tasks = [
      { modelId: "google", run: (signal: AbortSignal) =>
        new Promise<{ text: string }>((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted.push("google")
            reject(new DOMException("aborted", "AbortError"))
          })
        }),
      },
      { modelId: "microsoft", run: (signal: AbortSignal) =>
        new Promise<{ text: string }>((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted.push("microsoft")
            reject(new DOMException("aborted", "AbortError"))
          })
        }),
      },
    ]
    const ac = new AbortController()
    const promise = runColumnTranslations(tasks, ac.signal)
    setTimeout(() => ac.abort(), 10)
    const results = await promise
    expect(aborted.sort()).toEqual(["google", "microsoft"])
    for (const r of results) {
      expect("error" in r ? r.error.code : null).toBe("ABORTED")
    }
  })

  it("returns successful results when not aborted", async () => {
    const tasks = [
      { modelId: "google", run: async () => ({ text: "你好" }) },
    ]
    const ac = new AbortController()
    const results = await runColumnTranslations(tasks, ac.signal)
    expect(results).toEqual([{ modelId: "google", text: "你好" }])
  })

  it("isolates per-task errors so other tasks still complete", async () => {
    const tasks = [
      { modelId: "google", run: async () => ({ text: "ok" }) },
      { modelId: "fail", run: async () => { throw new Error("boom") } },
    ]
    const ac = new AbortController()
    const results = await runColumnTranslations(tasks, ac.signal)
    expect(results.find(r => r.modelId === "google")).toEqual({ modelId: "google", text: "ok" })
    const failed = results.find(r => r.modelId === "fail")!
    expect("error" in failed && failed.error.code).toBe("UNKNOWN")
  })

  it("captures synchronously-thrown errors as UNKNOWN", async () => {
    const tasks = [
      {
        modelId: "sync-fail",
        run: () => {
          throw new Error("sync explosion")
        },
      },
    ]
    const ac = new AbortController()
    const results = await runColumnTranslations(tasks, ac.signal)
    expect(results).toHaveLength(1)
    const r = results[0]
    expect("error" in r && r.error.code).toBe("UNKNOWN")
    expect("error" in r && r.error.message).toBe("sync explosion")
  })

  it("returns [] when given no tasks", async () => {
    const ac = new AbortController()
    const results = await runColumnTranslations([], ac.signal)
    expect(results).toEqual([])
  })
})
