import type { Entitlements } from "@/types/entitlements"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  deleteCachedEntitlements,
  readCachedEntitlements,
  writeCachedEntitlements,
} from "../../entitlements"

const getMock = vi.fn()
const putMock = vi.fn()
const deleteMock = vi.fn()

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    entitlementsCache: {
      get: (...args: unknown[]) => getMock(...args),
      put: (...args: unknown[]) => putMock(...args),
      delete: (...args: unknown[]) => deleteMock(...args),
    },
  },
}))

const freeEntitlements: Entitlements = {
  tier: "free",
  features: [],
  quota: {},
  expiresAt: null,
}

const proEntitlements: Entitlements = {
  tier: "pro",
  features: ["pdf_translate"],
  quota: { ai_translate_monthly: { used: 0, limit: 5000 } },
  expiresAt: "2099-01-01T00:00:00.000Z",
}

describe("entitlements-cache round-trip", () => {
  beforeEach(() => {
    getMock.mockReset()
    putMock.mockReset()
    deleteMock.mockReset()
  })

  it("write stores userId, value, and updatedAt; read returns the row", async () => {
    putMock.mockResolvedValue(undefined)
    const before = Date.now()
    await writeCachedEntitlements("u_1", proEntitlements)
    const after = Date.now()

    expect(putMock).toHaveBeenCalledTimes(1)
    const written = putMock.mock.calls[0][0] as {
      userId: string
      value: Entitlements
      updatedAt: Date
    }
    expect(written.userId).toBe("u_1")
    expect(written.value).toEqual(proEntitlements)
    expect(written.updatedAt).toBeInstanceOf(Date)
    const t = written.updatedAt.getTime()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(after)

    // Simulate read returning the written row
    getMock.mockResolvedValue(written)
    const row = await readCachedEntitlements("u_1")
    expect(row).toEqual(written)
    expect(getMock).toHaveBeenCalledWith("u_1")
  })

  it("returns null (not undefined) for an unknown userId", async () => {
    getMock.mockResolvedValue(undefined)
    const result = await readCachedEntitlements("unknown_user")
    expect(result).toBeNull()
  })

  it("write works for free entitlements", async () => {
    putMock.mockResolvedValue(undefined)
    await writeCachedEntitlements("u_free", freeEntitlements)
    const written = putMock.mock.calls[0][0] as { value: Entitlements }
    expect(written.value).toEqual(freeEntitlements)
  })

  it("delete calls db.delete with userId", async () => {
    deleteMock.mockResolvedValue(undefined)
    await deleteCachedEntitlements("u_1")
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(deleteMock).toHaveBeenCalledWith("u_1")
  })

  it("delete of non-existent userId does not throw", async () => {
    deleteMock.mockResolvedValue(undefined)
    await expect(deleteCachedEntitlements("no_such_user")).resolves.toBeUndefined()
  })
})
