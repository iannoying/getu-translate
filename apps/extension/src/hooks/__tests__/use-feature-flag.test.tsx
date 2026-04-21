// @vitest-environment jsdom
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useFeatureFlag } from "../use-feature-flag"

const sendMessageMock = vi.fn()

vi.mock("@/utils/message", () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}))

function renderWithClient<T>(hook: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(hook, { wrapper })
}

describe("useFeatureFlag", () => {
  beforeEach(() => {
    sendMessageMock.mockReset()
  })

  it("returns the defaultValue while loading", () => {
    sendMessageMock.mockReturnValue(new Promise(() => {}))
    const { result } = renderWithClient(() => useFeatureFlag("new_pdf", true))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.value).toBe(true)
  })

  it("returns true flag value and computes isEnabled", async () => {
    sendMessageMock.mockResolvedValue(true)
    const { result } = renderWithClient(() => useFeatureFlag("new_pdf"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.value).toBe(true)
    expect(result.current.isEnabled).toBe(true)
  })

  it("returns false when flag is disabled server-side", async () => {
    sendMessageMock.mockResolvedValue(false)
    const { result } = renderWithClient(() => useFeatureFlag("new_pdf"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.value).toBe(false)
    expect(result.current.isEnabled).toBe(false)
  })

  it("returns string variant and marks isEnabled=true", async () => {
    sendMessageMock.mockResolvedValue("variant-b")
    const { result } = renderWithClient(() => useFeatureFlag("ab_test"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.value).toBe("variant-b")
    expect(result.current.isEnabled).toBe(true)
  })

  it("returns defaultValue when backend returns undefined", async () => {
    sendMessageMock.mockResolvedValue(undefined)
    const { result } = renderWithClient(() => useFeatureFlag("unknown", "fallback"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.value).toBe("fallback")
    expect(result.current.isEnabled).toBe(true)
  })

  it("sends the expected message payload", async () => {
    sendMessageMock.mockResolvedValue(false)
    const { result } = renderWithClient(() => useFeatureFlag("my_flag"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(sendMessageMock).toHaveBeenCalledWith("getFeatureFlag", { key: "my_flag" })
  })
})
