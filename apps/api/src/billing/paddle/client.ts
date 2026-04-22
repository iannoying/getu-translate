export interface PaddleClientOpts {
  apiKey: string
  baseUrl: string
}

export interface CreateTransactionIn {
  priceId: string
  email: string
  userId: string
  successUrl: string
}
export interface CreateTransactionOut {
  transactionId: string
  checkoutUrl: string
}

export interface CreatePortalSessionIn {
  customerId: string
  subscriptionIds?: string[]
}
export interface CreatePortalSessionOut {
  url: string
}

export function createPaddleClient({ apiKey, baseUrl }: PaddleClientOpts) {
  async function call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Paddle-Version": "1",
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Paddle API ${res.status}: ${text.slice(0, 300)}`)
    }
    return (await res.json()) as T
  }

  return {
    async createTransaction(input: CreateTransactionIn): Promise<CreateTransactionOut> {
      const resp = await call<{ data: { id: string; checkout: { url: string } } }>(
        "/transactions",
        {
          items: [{ price_id: input.priceId, quantity: 1 }],
          customer: { email: input.email },
          custom_data: { user_id: input.userId },
          checkout: { url: input.successUrl },
          collection_mode: "automatic",
        },
      )
      return { transactionId: resp.data.id, checkoutUrl: resp.data.checkout.url }
    },

    async createPortalSession(input: CreatePortalSessionIn): Promise<CreatePortalSessionOut> {
      const body: Record<string, unknown> = {}
      if (input.subscriptionIds && input.subscriptionIds.length > 0) {
        body.subscription_ids = input.subscriptionIds
      }
      const resp = await call<{ data: { urls: { general: { overview: string } } } }>(
        `/customers/${input.customerId}/portal-sessions`,
        body,
      )
      return { url: resp.data.urls.general.overview }
    },
  }
}

export type PaddleClient = ReturnType<typeof createPaddleClient>
