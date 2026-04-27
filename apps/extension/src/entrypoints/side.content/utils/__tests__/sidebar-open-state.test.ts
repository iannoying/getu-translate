import { createStore } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"

const storageState = vi.hoisted(() => ({
  value: null as boolean | null,
  watchers: [] as ((value: boolean | null) => void)[],
  getItem: vi.fn(async () => null as boolean | null),
  setItem: vi.fn(async (_key: string, value: boolean) => {
    storageState.value = value
  }),
  watch: vi.fn((_key: string, cb: (value: boolean | null) => void) => {
    storageState.watchers.push(cb)
    return () => {
      storageState.watchers = storageState.watchers.filter(watcher => watcher !== cb)
    }
  }),
}))

vi.mock("#imports", () => ({
  storage: {
    getItem: storageState.getItem,
    setItem: storageState.setItem,
    watch: storageState.watch,
  },
}))

vi.mock("wxt/utils/storage", () => ({
  storage: {
    getItem: storageState.getItem,
    setItem: storageState.setItem,
    watch: storageState.watch,
  },
}))

describe("sidebar persisted open state", () => {
  beforeEach(() => {
    vi.resetModules()
    storageState.value = null
    storageState.watchers = []
    storageState.getItem.mockReset().mockResolvedValue(null)
    storageState.setItem.mockReset().mockImplementation(async (_key: string, value: boolean) => {
      storageState.value = value
    })
    storageState.watch.mockReset().mockImplementation((_key: string, cb: (value: boolean | null) => void) => {
      storageState.watchers.push(cb)
      return () => {
        storageState.watchers = storageState.watchers.filter(watcher => watcher !== cb)
      }
    })
  })

  it("hydrates false when storage is empty", async () => {
    const { isSideOpenAtom, SIDEBAR_OPEN_STORAGE_KEY } = await import("../sidebar-open-state")
    const store = createStore()
    const unsubscribe = store.sub(isSideOpenAtom, () => {})

    await Promise.resolve()
    await Promise.resolve()

    expect(storageState.getItem).toHaveBeenCalledWith(SIDEBAR_OPEN_STORAGE_KEY)
    expect(store.get(isSideOpenAtom)).toBe(false)

    unsubscribe()
  })

  it("hydrates true from local storage", async () => {
    storageState.getItem.mockResolvedValueOnce(true)
    const { isSideOpenAtom } = await import("../sidebar-open-state")
    const store = createStore()
    const unsubscribe = store.sub(isSideOpenAtom, () => {})

    await Promise.resolve()
    await Promise.resolve()

    expect(store.get(isSideOpenAtom)).toBe(true)

    unsubscribe()
  })

  it("persists open and close writes", async () => {
    const { isSideOpenAtom, SIDEBAR_OPEN_STORAGE_KEY } = await import("../sidebar-open-state")
    const store = createStore()
    const unsubscribe = store.sub(isSideOpenAtom, () => {})

    await store.set(isSideOpenAtom, true)
    await store.set(isSideOpenAtom, false)

    expect(storageState.setItem).toHaveBeenNthCalledWith(1, SIDEBAR_OPEN_STORAGE_KEY, true)
    expect(storageState.setItem).toHaveBeenNthCalledWith(2, SIDEBAR_OPEN_STORAGE_KEY, false)
    expect(store.get(isSideOpenAtom)).toBe(false)

    unsubscribe()
  })

  it("supports functional updates used by the floating button", async () => {
    const { isSideOpenAtom } = await import("../sidebar-open-state")
    const store = createStore()
    const unsubscribe = store.sub(isSideOpenAtom, () => {})

    await store.set(isSideOpenAtom, open => !open)

    expect(store.get(isSideOpenAtom)).toBe(true)
    expect(storageState.setItem).toHaveBeenCalledWith(expect.any(String), true)

    unsubscribe()
  })

  it("syncs storage watch changes from another tab", async () => {
    const { isSideOpenAtom } = await import("../sidebar-open-state")
    const store = createStore()
    const unsubscribe = store.sub(isSideOpenAtom, () => {})

    storageState.watchers.forEach(watcher => watcher(true))
    expect(store.get(isSideOpenAtom)).toBe(true)

    storageState.watchers.forEach(watcher => watcher(false))
    expect(store.get(isSideOpenAtom)).toBe(false)

    unsubscribe()
  })

  it("rolls back optimistic state when persisting fails", async () => {
    const error = new Error("storage unavailable")
    storageState.setItem.mockRejectedValueOnce(error)
    const { isSideOpenAtom } = await import("../sidebar-open-state")
    const store = createStore()
    const unsubscribe = store.sub(isSideOpenAtom, () => {})

    await store.set(isSideOpenAtom, true)

    expect(store.get(isSideOpenAtom)).toBe(false)

    unsubscribe()
  })
})
