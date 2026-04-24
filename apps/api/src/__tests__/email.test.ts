import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { renderOtpEmail, sendEmail } from "../email"
import type { WorkerEnv } from "../env"

function makeEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DB: {} as WorkerEnv["DB"],
    AUTH_SECRET: "x".repeat(32),
    AUTH_BASE_URL: "http://localhost:8788",
    ALLOWED_EXTENSION_ORIGINS: "http://localhost:3000",
    BIANXIE_API_KEY: "test-bianxie-key",
    BIANXIE_BASE_URL: "https://api.bianxie.ai/v1",
    AI_JWT_SECRET: "y".repeat(32),
    BILLING_ENABLED: "false",
    PADDLE_API_KEY: "",
    PADDLE_WEBHOOK_SECRET: "",
    PADDLE_PRICE_PRO_MONTHLY: "",
    PADDLE_PRICE_PRO_YEARLY: "",
    PADDLE_BASE_URL: "https://sandbox-api.paddle.com",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    STRIPE_PRICE_PRO_MONTHLY: "",
    STRIPE_PRICE_PRO_YEARLY: "",
    STRIPE_PRICE_CNY_MONTHLY: "",
    STRIPE_PRICE_CNY_YEARLY: "",
    STRIPE_BASE_URL: "https://api.stripe.com",
    ...overrides,
  }
}

describe("renderOtpEmail", () => {
  it("renders sign-in subject + body containing the otp", () => {
    const out = renderOtpEmail("123456", "sign-in")
    expect(out.subject).toContain("123456")
    expect(out.text).toContain("123456")
    expect(out.html).toContain("123456")
    expect(out.html).toContain("sign in")
  })

  it("uses different copy for password reset and verification", () => {
    expect(renderOtpEmail("000000", "forget-password").subject.toLowerCase()).toContain("password reset")
    expect(renderOtpEmail("000000", "email-verification").subject.toLowerCase()).toContain("verification")
  })
})

describe("sendEmail", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

  beforeEach(() => {
    fetchSpy.mockReset()
    consoleSpy.mockClear()
  })

  afterEach(() => {
    fetchSpy.mockReset()
  })

  it("logs to console when RESEND_API_KEY is missing (dev fallback)", async () => {
    await sendEmail(makeEnv(), { to: "u@example.com", subject: "Hi", html: "<p>x</p>", text: "x" })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalled()
  })

  it("posts to Resend when RESEND_API_KEY is set", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id: "abc" }), { status: 200 }))
    await sendEmail(
      makeEnv({ RESEND_API_KEY: "re_test", EMAIL_FROM: "noreply@example.com" }),
      { to: "u@example.com", subject: "Hi", html: "<p>x</p>" },
    )
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe("https://api.resend.com/emails")
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer re_test")
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.from).toBe("noreply@example.com")
    expect(body.to).toEqual(["u@example.com"])
  })

  it("throws when Resend returns a non-2xx", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 422 }))
    await expect(sendEmail(
      makeEnv({ RESEND_API_KEY: "re_test" }),
      { to: "u@example.com", subject: "Hi", html: "<p>x</p>" },
    )).rejects.toThrow(/resend 422/)
  })
})
