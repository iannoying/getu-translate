import type { WorkerEnv } from "./env"

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text?: string
}

const RESEND_ENDPOINT = "https://api.resend.com/emails"

export async function sendEmail(env: WorkerEnv, msg: EmailMessage): Promise<void> {
  const apiKey = env.RESEND_API_KEY
  const from = env.EMAIL_FROM ?? "GetU Translate <noreply@getutranslate.com>"

  if (!apiKey) {
    // Local dev fallback: log to console so devs can copy the OTP without provisioning Resend.
    console.log(`[email] (no RESEND_API_KEY; dev mode) to=${msg.to} subject=${msg.subject}\n${msg.text ?? msg.html}`)
    return
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`resend ${res.status}: ${body.slice(0, 200)}`)
  }
}

export type OtpEmailType = "sign-in" | "email-verification" | "forget-password" | "change-email"

export function renderOtpEmail(otp: string, type: OtpEmailType, brand = "GetU Translate"): { subject: string; html: string; text: string } {
  const purpose = type === "sign-in"
    ? "sign in to"
    : type === "forget-password"
      ? "reset your password for"
      : type === "change-email"
        ? "change your email on"
        : "verify your email for"

  const subject = type === "sign-in"
    ? `${brand} sign-in code: ${otp}`
    : type === "forget-password"
      ? `${brand} password reset code: ${otp}`
      : type === "change-email"
        ? `${brand} email-change code: ${otp}`
        : `${brand} verification code: ${otp}`

  const text = `Your ${brand} code is ${otp}\n\nUse it to ${purpose} ${brand}. The code expires in 5 minutes. If you didn't request this, you can ignore this email.`

  const html = `<!doctype html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 40px auto; padding: 24px; color: #1a1a1a;">
    <h2 style="margin:0 0 16px;font-size:18px;">${brand}</h2>
    <p style="margin:0 0 16px;">Use this code to ${purpose} ${brand}:</p>
    <p style="font-size:32px;font-weight:600;letter-spacing:0.18em;background:#f4f4f5;padding:16px;border-radius:8px;text-align:center;margin:0 0 16px;">${otp}</p>
    <p style="margin:0 0 8px;color:#71717a;font-size:13px;">The code expires in 5 minutes.</p>
    <p style="margin:0;color:#a1a1aa;font-size:12px;">If you didn't request this, you can ignore this email.</p>
  </body></html>`

  return { subject, html, text }
}
