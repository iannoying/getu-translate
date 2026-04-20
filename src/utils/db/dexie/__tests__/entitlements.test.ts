import type { Entitlements } from "@/types/entitlements"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { readCachedEntitlements, writeCachedEntitlements } from "../entitlements"

const getMock = vi.fn()
const putMock = vi.fn()

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    entitlementsCache: {
      get: (...args: unknown[]) => getMock(...args),
      put: (...args: unknown[]) => putMock(...args),
    },
  },
}))

const proEntitlements: Entitlements = {
  tier: "pro",
  features: ["pdf_translate"],
  quota: { ai_translate_monthly: { used: 10, limit: 5000 } },
  expiresAt: "2099-01-01T00:00:00.000Z",
}

describe("writeCachedEntitlements", () => {
  beforeEach(() => {
    getMock.mockReset()
    putMock.mockReset()
  })

  it("puts a row keyed by userId with the provided value and a fresh Date", async () => {
    putMock.mockResolvedValue(undefined)
    const before = Date.now()
    await writeCachedEntitlements("u_1", proEntitlements)
    const after = Date.now()

    expect(putMock).toHaveBeenCalledTimes(1)
    const arg = putMock.mock.calls[0][0] as {
      userId: string
      value: Entitlements
      updatedAt: Date
    }
    expect(arg.userId).toBe("u_1")
    expect(arg.value).toEqual(proEntitlements)
    expect(arg.updatedAt).toBeInstanceOf(Date)
    const t = arg.updatedAt.getTime()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(after)
  })

  it("propagates db errors", async () => {
    putMock.mockRejectedValue(new Error("disk full"))
    await expect(writeCachedEntitlements("u_2", proEntitlements))
      .rejects
      .toThrow(/disk full/)
  })
})

describe("readCachedEntitlements", () => {
  beforeEach(() => {
    getMock.mockReset()
    putMock.mockReset()
  })

  it("returns the row when found", async () => {
    const row = { userId: "u_1", value: proEntitlements, updatedAt: new Date() }
    getMock.mockResolvedValue(row)
    await expect(readCachedEntitlements("u_1")).resolves.toEqual(row)
    expect(getMock).toHaveBeenCalledWith("u_1")
  })

  it("returns null (not undefined) when missing", async () => {
    getMock.mockResolvedValue(undefined)
    await expect(readCachedEntitlements("missing")).resolves.toBeNull()
  })

  it("propagates db errors", async () => {
    getMock.mockRejectedValue(new Error("db closed"))
    await expect(readCachedEntitlements("u_x")).rejects.toThrow(/db closed/)
  })
})
