import { createStore } from "jotai"
import { describe, expect, it } from "vitest"
import { segmentStatusAtomFamily } from "../atoms"

describe("segmentStatusAtomFamily", () => {
  it("returns pending as initial state", () => {
    const store = createStore()
    const atom = segmentStatusAtomFamily("file1:p-0-0")
    expect(store.get(atom)).toEqual({ kind: "pending" })
  })

  it("preserves a `done` status set through the store", () => {
    const store = createStore()
    const atom = segmentStatusAtomFamily("file1:p-0-0")
    store.set(atom, { kind: "done", translation: "hello" })
    expect(store.get(atom)).toEqual({ kind: "done", translation: "hello" })
  })

  it("preserves a `translating` status set through the store", () => {
    const store = createStore()
    const atom = segmentStatusAtomFamily("file1:p-0-1")
    store.set(atom, { kind: "translating" })
    expect(store.get(atom)).toEqual({ kind: "translating" })
  })

  it("preserves an `error` status set through the store", () => {
    const store = createStore()
    const atom = segmentStatusAtomFamily("file1:p-0-2")
    store.set(atom, { kind: "error", message: "boom" })
    expect(store.get(atom)).toEqual({ kind: "error", message: "boom" })
  })

  it("returns the same atom instance for the same key (atomFamily identity)", () => {
    const a = segmentStatusAtomFamily("file1:p-0-0")
    const b = segmentStatusAtomFamily("file1:p-0-0")
    expect(a).toBe(b)
  })

  it("returns different atom instances for different keys", () => {
    const a = segmentStatusAtomFamily("file1:p-0-0")
    const b = segmentStatusAtomFamily("file1:p-0-1")
    const c = segmentStatusAtomFamily("file2:p-0-0")
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(b).not.toBe(c)
  })

  it("keeps segment atoms isolated — writing one does not affect another", () => {
    const store = createStore()
    const atomA = segmentStatusAtomFamily("fileX:p-0-0")
    const atomB = segmentStatusAtomFamily("fileX:p-0-1")
    store.set(atomA, { kind: "done", translation: "aaa" })
    expect(store.get(atomA)).toEqual({ kind: "done", translation: "aaa" })
    expect(store.get(atomB)).toEqual({ kind: "pending" })
  })
})
