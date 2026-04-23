export interface StripeClientOpts {
  apiKey: string
  baseUrl: string // typically https://api.stripe.com
}

export interface CreateCheckoutSessionIn {
  priceId: string
  email: string
  userId: string
  successUrl: string
  cancelUrl: string
}
export interface CreateCheckoutSessionOut {
  sessionId: string
  checkoutUrl: string
}

export interface CreateOneTimePaymentSessionIn {
  method: "alipay" | "wechat_pay"
  amountCents: number
  currency: string
  productName: string
  email: string
  userId: string
  successUrl: string
  cancelUrl: string
  durationDays: number
}

export interface CreatePortalSessionIn {
  customerId: string
  returnUrl: string
}
export interface CreatePortalSessionOut {
  url: string
}

function encodeForm(params: Record<string, string>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) usp.append(k, v)
  return usp.toString()
}

export function createStripeClient({ apiKey, baseUrl }: StripeClientOpts) {
  async function call<T>(path: string, body: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      // Try to extract Stripe's structured error message
      let detail = text.slice(0, 300)
      try {
        const parsed = JSON.parse(text)
        if (parsed?.error?.message) detail = parsed.error.message
      } catch { /* ignore */ }
      throw new Error(`Stripe API ${res.status}: ${detail}`)
    }
    try {
      return (await res.json()) as T
    } catch {
      throw new Error("Stripe API: invalid JSON response")
    }
  }

  return {
    async createCheckoutSession(input: CreateCheckoutSessionIn): Promise<CreateCheckoutSessionOut> {
      const body = encodeForm({
        "mode": "subscription",
        "line_items[0][price]": input.priceId,
        "line_items[0][quantity]": "1",
        "customer_email": input.email,
        "client_reference_id": input.userId,
        "success_url": input.successUrl,
        "cancel_url": input.cancelUrl,
      })
      const resp = await call<{ id: string; url: string }>("/v1/checkout/sessions", body)
      return { sessionId: resp.id, checkoutUrl: resp.url }
    },

    async createOneTimePaymentSession(input: CreateOneTimePaymentSessionIn): Promise<CreateCheckoutSessionOut> {
      const params: Record<string, string> = {
        "mode": "payment",
        "line_items[0][price_data][currency]": input.currency,
        "line_items[0][price_data][unit_amount]": String(input.amountCents),
        "line_items[0][price_data][product_data][name]": input.productName,
        "line_items[0][quantity]": "1",
        "customer_email": input.email,
        "client_reference_id": input.userId,
        "success_url": input.successUrl,
        "cancel_url": input.cancelUrl,
        "metadata[duration_days]": String(input.durationDays),
        "metadata[user_id]": input.userId,
        "payment_method_types[0]": input.method,
      }
      if (input.method === "wechat_pay") {
        params["payment_method_options[wechat_pay][client]"] = "web"
      }
      const body = encodeForm(params)
      const resp = await call<{ id: string; url: string }>("/v1/checkout/sessions", body)
      return { sessionId: resp.id, checkoutUrl: resp.url }
    },

    async createPortalSession(input: CreatePortalSessionIn): Promise<CreatePortalSessionOut> {
      const body = encodeForm({
        customer: input.customerId,
        return_url: input.returnUrl,
      })
      const resp = await call<{ url: string }>("/v1/billing_portal/sessions", body)
      return { url: resp.url }
    },
  }
}

export type StripeClient = ReturnType<typeof createStripeClient>
