# Extension Sidebar Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the extension right-side translation sidebar with Text and Document tabs, opened from the existing floating button and matching the approved Immersive Translate-style spec.

**Architecture:** Reuse `apps/extension/src/entrypoints/side.content` for Shadow DOM mounting, page reflow, resize, theme, Jotai scope, and toasts. Put reusable translation workbench logic under `apps/extension/src/components/translation-workbench`, then compose a compact sidebar shell in `side.content/components/side-content`. Keep backend accounting authoritative by consuming the web text click bucket through oRPC and charging GetU Pro model token usage through the AI proxy's `web_text_translate_token_monthly` bucket.

**Tech Stack:** WXT content scripts, React 19, Jotai, TanStack Query, Base UI/shadcn components, Vitest + Testing Library, Hono/oRPC Cloudflare Worker API, Drizzle/D1 quota tables, Vercel AI SDK.

---

## Reference Documents

- Approved spec: `docs/specs/2026-04-26-extension-sidebar-design.md`
- Sidebar entrypoint notes: `apps/extension/src/entrypoints/side.content/AGENTS.md`
- Sidebar component notes: `apps/extension/src/entrypoints/side.content/components/AGENTS.md`
- Existing translation hub: `apps/extension/src/entrypoints/translation-hub/`
- Website text translation UI: `apps/web/app/[locale]/translate/`
- Backend text translation quota: `apps/api/src/orpc/translate/quota.ts`
- Backend AI proxy quota charging: `apps/api/src/ai/proxy.ts`

## File Map

### Backend

- Modify: `apps/api/src/ai/proxy.ts`  
  Accept `x-getu-quota-bucket` for a constrained set of AI proxy quota buckets and pass the resolved bucket into `consumeQuota`.
- Modify: `apps/api/src/ai/__tests__/proxy.test.ts`  
  Cover default `ai_translate_monthly` charging and explicit `web_text_translate_token_monthly` charging.

### Extension Translation Engine

- Modify: `apps/extension/src/utils/host/translate/api/ai.ts`  
  Add optional per-call `headers` to `aiTranslate()` and pass them to `generateText()`.
- Modify: `apps/extension/src/utils/host/translate/execute-translate.ts`  
  Thread `headers` through the LLM provider path.
- Create: `apps/extension/src/utils/host/translate/api/__tests__/ai.test.ts`  
  Verify AI SDK request headers are forwarded.

### Shared Workbench

- Create: `apps/extension/src/components/translation-workbench/types.ts`  
  Shared workbench state, plan, gate, and result types.
- Create: `apps/extension/src/components/translation-workbench/provider-gating.ts`  
  Provider selection, GetU Pro gating, char limits, request id helpers.
- Create: `apps/extension/src/components/translation-workbench/language-options.ts`  
  Website-style language option list and ISO-639-1 ↔ ISO-639-3 adapters.
- Create: `apps/extension/src/components/translation-workbench/translate-runner.ts`  
  Run selected providers, consume click quota, isolate per-provider errors, and attach GetU Pro token-accounting headers.
- Create: `apps/extension/src/components/translation-workbench/use-auth-refresh.ts`  
  Refresh session and entitlements when the tab regains focus after website login.
- Create: `apps/extension/src/components/translation-workbench/__tests__/provider-gating.test.ts`
- Create: `apps/extension/src/components/translation-workbench/__tests__/language-options.test.ts`
- Create: `apps/extension/src/components/translation-workbench/__tests__/translate-runner.test.ts`

### Shared Workbench UI

- Create: `apps/extension/src/components/translation-workbench/language-picker.tsx`  
  Website-style source/target language picker with disabled swap when source is auto.
- Create: `apps/extension/src/components/translation-workbench/provider-multi-select.tsx`  
  Multi-provider selector using extension `providersConfig` order and grouped free/BYOK/GetU Pro entries.
- Create: `apps/extension/src/components/translation-workbench/provider-icon-stack.tsx`  
  Compact selected-provider icon stack for the sidebar header.
- Create: `apps/extension/src/components/translation-workbench/result-card.tsx`  
  Per-provider loading, success, error, login-required, upgrade-required, and quota-exhausted cards.
- Create: `apps/extension/src/components/translation-workbench/__tests__/language-picker.test.tsx`
- Create: `apps/extension/src/components/translation-workbench/__tests__/result-card.test.tsx`

### Sidebar UI

- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/index.tsx`  
  Keep resize and page reflow, replace the current temporary body with the shell.
- Create: `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-shell.tsx`
- Create: `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx`
- Create: `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-document-tab.tsx`
- Create: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx`
- Create: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-document-tab.test.tsx`
- Create: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/side-content-reflow.test.tsx`

### Floating Button

- Modify: `apps/extension/src/entrypoints/side.content/components/floating-button/index.tsx`  
  Add hover/focus "open panel" tab without changing the logo button's existing click behavior.
- Modify: `apps/extension/src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx`  
  Prove the main button behavior stays unchanged and the tab opens the sidebar.

### i18n

- Modify: `apps/extension/src/locales/en.yml`
- Modify: `apps/extension/src/locales/zh-CN.yml`  
  Add sidebar/workbench copy. Other locale files fall back to English through `resolveMessage()`.

### Translation Hub Reuse

- Modify: `apps/extension/src/entrypoints/translation-hub/atoms.ts`
- Modify: `apps/extension/src/entrypoints/translation-hub/components/text-input.tsx`
- Modify: `apps/extension/src/entrypoints/translation-hub/components/language-control-panel.tsx`
- Modify: `apps/extension/src/entrypoints/translation-hub/components/translation-service-dropdown.tsx`
- Modify: `apps/extension/src/entrypoints/translation-hub/components/translation-card.tsx`  
  Reuse shared workbench helpers while preserving the existing wide translation hub layout.

---

## Task 1: AI Proxy Supports Web Text Token Bucket

**Files:**
- Modify: `apps/api/src/ai/proxy.ts`
- Modify: `apps/api/src/ai/__tests__/proxy.test.ts`

- [ ] **Step 1: Write the failing test for explicit web text token bucket**

Append this test after `calls consumeQuota after streaming with parsed usage` in `apps/api/src/ai/__tests__/proxy.test.ts`:

```ts
  it("charges the web text token bucket when requested by header", async () => {
    const { verifyAiJwt } = await import("../jwt")
    const { consumeQuota } = await import("../../billing/quota")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce({ userId: "u1", exp: 9e9 })
    const sse = [
      `data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n`,
      `data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":5}}\n\n`,
      `data: [DONE]\n\n`,
    ].join("")
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(sse, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    )
    const ctx = fakeCtx()
    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer ok",
        "x-request-id": "sidebar-token-req",
        "x-getu-quota-bucket": "web_text_translate_token_monthly",
      },
      body: JSON.stringify({
        model: "deepseek-v4-pro",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    })

    const r = await handleChatCompletions(req, env, ctx as any)
    const reader = r.body!.getReader()
    while (!(await reader.read()).done) {}
    await ctx.drain()

    expect(consumeQuota).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "web_text_translate_token_monthly",
      40,
      "sidebar-token-req",
      undefined,
      "deepseek-v4-pro",
      20,
      5,
    )
  })
```

- [ ] **Step 2: Verify the new test fails**

Run:

```bash
pnpm --filter @getu/api test -- src/ai/__tests__/proxy.test.ts
```

Expected: the new test fails because `consumeQuota` still receives `"ai_translate_monthly"`.

- [ ] **Step 3: Implement constrained bucket resolution**

In `apps/api/src/ai/proxy.ts`, add this type and resolver near the imports:

```ts
type AiProxyQuotaBucket = "ai_translate_monthly" | "web_text_translate_token_monthly"

function resolveAiProxyQuotaBucket(req: Request): AiProxyQuotaBucket {
  const raw = req.headers.get("x-getu-quota-bucket")
  if (raw === null || raw === "" || raw === "ai_translate_monthly") {
    return "ai_translate_monthly"
  }
  if (raw === "web_text_translate_token_monthly") {
    return raw
  }
  return "ai_translate_monthly"
}
```

Then resolve the bucket after `requestId` and pass it into both charge branches:

```ts
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID()
  const quotaBucket = resolveAiProxyQuotaBucket(req)

  // 4. Stream branch
  const isStream =
    body.stream === true ||
    (upstream.headers.get("content-type") ?? "").includes("text/event-stream")
  if (isStream) {
    const [forward, usageP] = extractUsageFromSSE(upstream.body)
    ctx.waitUntil(chargeAfterStream(db, userId, model, usageP, requestId, quotaBucket))
    return new Response(forward, {
      status: 200,
      headers: filterResponseHeaders(upstream.headers),
    })
  }
```

Update the non-stream branch:

```ts
  ctx.waitUntil(chargeAfterStream(db, userId, model, Promise.resolve(usage), requestId, quotaBucket))
```

Update `chargeAfterStream`:

```ts
async function chargeAfterStream(
  db: ReturnType<typeof createDb>,
  userId: string,
  model: ProModel,
  usageP: Promise<{ input: number; output: number } | null>,
  requestId: string,
  quotaBucket: AiProxyQuotaBucket,
): Promise<void> {
  try {
    const usage = await usageP
    const units = usage == null ? 1 : normalizeTokens(model, usage)
    if (units < 1) return
    await consumeQuota(
      db, userId, quotaBucket, units, requestId,
      undefined,
      model,
      usage?.input,
      usage?.output,
    )
  } catch (err) {
    console.warn("[ai-proxy] charge failed", { userId, model, requestId, quotaBucket, err: String(err) })
  }
}
```

- [ ] **Step 4: Verify API proxy tests pass**

Run:

```bash
pnpm --filter @getu/api test -- src/ai/__tests__/proxy.test.ts
```

Expected: all tests in `proxy.test.ts` pass.

- [ ] **Step 5: Commit backend bucket support**

```bash
git add apps/api/src/ai/proxy.ts apps/api/src/ai/__tests__/proxy.test.ts
git commit -m "feat(api): support web text token quota in ai proxy"
```

---

## Task 2: Thread Per-Call Headers Through Extension AI Translation

**Files:**
- Modify: `apps/extension/src/utils/host/translate/api/ai.ts`
- Modify: `apps/extension/src/utils/host/translate/execute-translate.ts`
- Create: `apps/extension/src/utils/host/translate/api/__tests__/ai.test.ts`

- [ ] **Step 1: Write the failing AI header forwarding test**

Create `apps/extension/src/utils/host/translate/api/__tests__/ai.test.ts`:

```ts
import type { LLMProviderConfig } from "@/types/config/provider"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { aiTranslate } from "../ai"

const generateTextMock = vi.hoisted(() => vi.fn(async () => ({ text: "translated" })))
const getModelByIdMock = vi.hoisted(() => vi.fn(async () => ({ provider: "model" })))
const resolveModelIdMock = vi.hoisted(() => vi.fn(() => "deepseek-v4-pro"))
const promptResolverMock = vi.hoisted(() => vi.fn(async () => ({
  systemPrompt: "translate",
  prompt: "hello",
})))

vi.mock("ai", () => ({
  generateText: generateTextMock,
}))

vi.mock("@/utils/providers/model", () => ({
  getModelById: getModelByIdMock,
}))

vi.mock("@/utils/providers/model-id", () => ({
  resolveModelId: resolveModelIdMock,
}))

vi.mock("@/utils/providers/options", () => ({
  getProviderOptionsWithOverride: vi.fn(() => ({})),
}))

describe("aiTranslate", () => {
  beforeEach(() => {
    generateTextMock.mockClear()
    getModelByIdMock.mockClear()
    resolveModelIdMock.mockClear()
    promptResolverMock.mockClear()
  })

  it("passes per-call headers to generateText", async () => {
    const providerConfig = {
      id: "getu-pro-default",
      name: "DeepSeek-V4-Pro",
      enabled: true,
      provider: "getu-pro",
      model: { model: "deepseek-v4-pro", isCustomModel: false, customModel: null },
    } as LLMProviderConfig

    await aiTranslate("hello", "Chinese", providerConfig, promptResolverMock, {
      headers: {
        "x-request-id": "sidebar-token-1",
        "x-getu-quota-bucket": "web_text_translate_token_monthly",
      },
    })

    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
      headers: {
        "x-request-id": "sidebar-token-1",
        "x-getu-quota-bucket": "web_text_translate_token_monthly",
      },
    }))
  })
})
```

- [ ] **Step 2: Verify the new test fails**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/utils/host/translate/api/__tests__/ai.test.ts
```

Expected: the test fails because `generateText()` is called without `headers`.

- [ ] **Step 3: Add the shared LLM translation options type**

In `apps/extension/src/utils/host/translate/api/ai.ts`, add this exported interface below `PromptResolver`:

```ts
export interface AiTranslateOptions<TContext = unknown> {
  isBatch?: boolean
  context?: TContext
  headers?: Record<string, string | undefined>
}
```

Change the `aiTranslate` signature:

```ts
export async function aiTranslate<TContext>(
  text: string,
  targetLangName: string,
  providerConfig: LLMProviderConfig,
  promptResolver: PromptResolver<TContext>,
  options?: AiTranslateOptions<TContext>,
) {
```

Add `headers` to `generateText()`:

```ts
    const { text: translatedText } = await generateText({
      model,
      system: systemPrompt,
      prompt,
      temperature,
      providerOptions,
      headers: options?.headers,
      maxRetries: 0,
    })
```

- [ ] **Step 4: Thread the same options through executeTranslate**

In `apps/extension/src/utils/host/translate/execute-translate.ts`, import the new type:

```ts
import type { AiTranslateOptions, PromptResolver } from "./api/ai"
```

Update the `executeTranslate` options type:

```ts
  options?: AiTranslateOptions<TContext> & {
    forceBackgroundFetch?: boolean
  },
```

The existing LLM call remains:

```ts
    translatedText = await aiTranslate(preparedText, targetLangName, providerConfig, promptResolver, options)
```

- [ ] **Step 5: Verify extension translation tests pass**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/utils/host/translate/api/__tests__/ai.test.ts src/utils/host/translate/__tests__/execute-translate.test.ts
```

Expected: both test files pass.

- [ ] **Step 6: Commit AI header plumbing**

```bash
git add apps/extension/src/utils/host/translate/api/ai.ts apps/extension/src/utils/host/translate/execute-translate.ts apps/extension/src/utils/host/translate/api/__tests__/ai.test.ts
git commit -m "feat(extension): pass ai translation request headers"
```

---

## Task 3: Shared Workbench Gating, Languages, And Quota Helpers

**Files:**
- Create: `apps/extension/src/components/translation-workbench/types.ts`
- Create: `apps/extension/src/components/translation-workbench/provider-gating.ts`
- Create: `apps/extension/src/components/translation-workbench/language-options.ts`
- Create: `apps/extension/src/components/translation-workbench/__tests__/provider-gating.test.ts`
- Create: `apps/extension/src/components/translation-workbench/__tests__/language-options.test.ts`

- [ ] **Step 1: Write gating tests**

Create `apps/extension/src/components/translation-workbench/__tests__/provider-gating.test.ts`:

```ts
import type { TranslateProviderConfig } from "@/types/config/provider"
import { describe, expect, it } from "vitest"
import {
  buildSidebarClickRequestId,
  buildSidebarTokenRequestId,
  getProviderGate,
  getTextTranslateCharLimit,
  isGetuProProvider,
} from "../provider-gating"

const googleProvider = {
  id: "google-translate-default",
  name: "Google Translate",
  enabled: true,
  provider: "google-translate",
} as TranslateProviderConfig

const getuProProvider = {
  id: "getu-pro-default",
  name: "DeepSeek-V4-Pro",
  enabled: true,
  provider: "getu-pro",
  model: { model: "deepseek-v4-pro", isCustomModel: false, customModel: null },
} as TranslateProviderConfig

describe("provider-gating", () => {
  it("identifies GetU Pro providers", () => {
    expect(isGetuProProvider(getuProProvider)).toBe(true)
    expect(isGetuProProvider(googleProvider)).toBe(false)
  })

  it("requires login before anonymous users can invoke any provider", () => {
    expect(getProviderGate(googleProvider, "anonymous")).toBe("login-required")
    expect(getProviderGate(getuProProvider, "anonymous")).toBe("login-required")
  })

  it("allows free providers for signed-in plans", () => {
    expect(getProviderGate(googleProvider, "free")).toBe("available")
    expect(getProviderGate(googleProvider, "pro")).toBe("available")
    expect(getProviderGate(googleProvider, "enterprise")).toBe("available")
  })

  it("gates GetU Pro providers by auth and entitlement", () => {
    expect(getProviderGate(getuProProvider, "anonymous")).toBe("login-required")
    expect(getProviderGate(getuProProvider, "free")).toBe("upgrade-required")
    expect(getProviderGate(getuProProvider, "pro")).toBe("available")
    expect(getProviderGate(getuProProvider, "enterprise")).toBe("available")
  })

  it("uses website text limits", () => {
    expect(getTextTranslateCharLimit("anonymous")).toBe(2000)
    expect(getTextTranslateCharLimit("free")).toBe(2000)
    expect(getTextTranslateCharLimit("pro")).toBe(20000)
    expect(getTextTranslateCharLimit("enterprise")).toBe(20000)
  })

  it("builds separate request ids for click and token buckets", () => {
    expect(buildSidebarClickRequestId("abc")).toBe("sidebar-web-text:abc")
    expect(buildSidebarTokenRequestId("abc", "getu-pro-default")).toBe("sidebar-web-text-token:abc:getu-pro-default")
  })
})
```

- [ ] **Step 2: Write language adapter tests**

Create `apps/extension/src/components/translation-workbench/__tests__/language-options.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  SIDEBAR_SOURCE_LANGUAGES,
  SIDEBAR_TARGET_LANGUAGES,
  fromSidebarLanguageCode,
  toSidebarLanguageCode,
} from "../language-options"

describe("language-options", () => {
  it("keeps auto only in source languages", () => {
    expect(SIDEBAR_SOURCE_LANGUAGES[0]).toEqual({ code: "auto", iso6393: "auto", labelKey: "translationWorkbench.languages.auto" })
    expect(SIDEBAR_TARGET_LANGUAGES.some(l => l.code === "auto")).toBe(false)
  })

  it("maps website-style language codes to extension ISO-639-3 codes", () => {
    expect(fromSidebarLanguageCode("auto")).toBe("auto")
    expect(fromSidebarLanguageCode("en")).toBe("eng")
    expect(fromSidebarLanguageCode("zh-CN")).toBe("cmn")
    expect(fromSidebarLanguageCode("zh-TW")).toBe("cmnHant")
    expect(fromSidebarLanguageCode("ja")).toBe("jpn")
  })

  it("maps extension ISO-639-3 codes back to website-style language codes", () => {
    expect(toSidebarLanguageCode("auto")).toBe("auto")
    expect(toSidebarLanguageCode("eng")).toBe("en")
    expect(toSidebarLanguageCode("cmn")).toBe("zh-CN")
    expect(toSidebarLanguageCode("cmnHant")).toBe("zh-TW")
    expect(toSidebarLanguageCode("kor")).toBe("ko")
  })
})
```

- [ ] **Step 3: Verify helper tests fail**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/components/translation-workbench/__tests__/provider-gating.test.ts src/components/translation-workbench/__tests__/language-options.test.ts
```

Expected: tests fail because the new modules do not exist.

- [ ] **Step 4: Implement shared types**

Create `apps/extension/src/components/translation-workbench/types.ts`:

```ts
import type { LangCodeISO6393 } from "@getu/definitions"
import type { TranslateProviderConfig } from "@/types/config/provider"

export type TranslationWorkbenchPlan = "anonymous" | "free" | "pro" | "enterprise"

export type ProviderGate = "available" | "login-required" | "upgrade-required"

export type TranslationResultStatus =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "login-required"
  | "upgrade-required"
  | "quota-exhausted"

export interface TranslationResultState {
  providerId: string
  status: TranslationResultStatus
  text?: string
  errorMessage?: string
}

export interface TranslationRequestSnapshot {
  text: string
  sourceLanguage: LangCodeISO6393 | "auto"
  targetLanguage: LangCodeISO6393
  clickId: string
}

export interface TranslationProviderRun {
  provider: TranslateProviderConfig
  gate: ProviderGate
}
```

- [ ] **Step 5: Implement provider gating helpers**

Create `apps/extension/src/components/translation-workbench/provider-gating.ts`:

```ts
import type { Entitlements } from "@/types/entitlements"
import type { TranslateProviderConfig } from "@/types/config/provider"
import { isPro } from "@/types/entitlements"
import type { ProviderGate, TranslationWorkbenchPlan } from "./types"

const TEXT_TRANSLATE_CHAR_LIMITS: Record<TranslationWorkbenchPlan, number> = {
  anonymous: 2000,
  free: 2000,
  pro: 20000,
  enterprise: 20000,
}

export function planFromEntitlements(userId: string | null, entitlements: Entitlements): TranslationWorkbenchPlan {
  if (userId === null) return "anonymous"
  if (entitlements.tier === "enterprise" && isPro(entitlements)) return "enterprise"
  if (entitlements.tier === "pro" && isPro(entitlements)) return "pro"
  return "free"
}

export function getTextTranslateCharLimit(plan: TranslationWorkbenchPlan): number {
  return TEXT_TRANSLATE_CHAR_LIMITS[plan]
}

export function isGetuProProvider(provider: TranslateProviderConfig): boolean {
  return provider.provider === "getu-pro"
}

export function getProviderGate(provider: TranslateProviderConfig, plan: TranslationWorkbenchPlan): ProviderGate {
  if (plan === "anonymous") return "login-required"
  if (!isGetuProProvider(provider)) return "available"
  if (plan === "free") return "upgrade-required"
  return "available"
}

export function buildSidebarClickRequestId(clickId: string): string {
  return `sidebar-web-text:${clickId}`
}

export function buildSidebarTokenRequestId(clickId: string, providerId: string): string {
  return `sidebar-web-text-token:${clickId}:${providerId}`
}
```

- [ ] **Step 6: Implement language adapters**

Create `apps/extension/src/components/translation-workbench/language-options.ts`:

```ts
import type { LangCodeISO6393 } from "@getu/definitions"

export type SidebarLanguageCode = "auto" | "en" | "zh-CN" | "zh-TW" | "ja" | "ko" | "fr" | "de" | "es" | "ru"

export interface SidebarLanguageOption {
  code: SidebarLanguageCode
  iso6393: LangCodeISO6393 | "auto"
  labelKey: string
}

export const SIDEBAR_SOURCE_LANGUAGES: SidebarLanguageOption[] = [
  { code: "auto", iso6393: "auto", labelKey: "translationWorkbench.languages.auto" },
  { code: "en", iso6393: "eng", labelKey: "languages.eng" },
  { code: "zh-CN", iso6393: "cmn", labelKey: "languages.cmn" },
  { code: "zh-TW", iso6393: "cmnHant", labelKey: "languages.cmnHant" },
  { code: "ja", iso6393: "jpn", labelKey: "languages.jpn" },
  { code: "ko", iso6393: "kor", labelKey: "languages.kor" },
  { code: "fr", iso6393: "fra", labelKey: "languages.fra" },
  { code: "de", iso6393: "deu", labelKey: "languages.deu" },
  { code: "es", iso6393: "spa", labelKey: "languages.spa" },
  { code: "ru", iso6393: "rus", labelKey: "languages.rus" },
]

export const SIDEBAR_TARGET_LANGUAGES = SIDEBAR_SOURCE_LANGUAGES.filter(l => l.code !== "auto")

export function fromSidebarLanguageCode(code: SidebarLanguageCode): LangCodeISO6393 | "auto" {
  return SIDEBAR_SOURCE_LANGUAGES.find(l => l.code === code)?.iso6393 ?? "eng"
}

export function toSidebarLanguageCode(code: LangCodeISO6393 | "auto"): SidebarLanguageCode {
  return SIDEBAR_SOURCE_LANGUAGES.find(l => l.iso6393 === code)?.code ?? "en"
}
```

- [ ] **Step 7: Verify helper tests pass**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/components/translation-workbench/__tests__/provider-gating.test.ts src/components/translation-workbench/__tests__/language-options.test.ts
```

Expected: both helper test files pass.

- [ ] **Step 8: Commit shared helpers**

```bash
git add apps/extension/src/components/translation-workbench
git commit -m "feat(extension): add translation workbench helpers"
```

---

## Task 4: Translation Runner With Click Quota And Per-Provider Isolation

**Files:**
- Create: `apps/extension/src/components/translation-workbench/translate-runner.ts`
- Create: `apps/extension/src/components/translation-workbench/__tests__/translate-runner.test.ts`

- [ ] **Step 1: Write runner tests**

Create `apps/extension/src/components/translation-workbench/__tests__/translate-runner.test.ts`:

```ts
import type { TranslateProviderConfig } from "@/types/config/provider"
import { describe, expect, it, vi } from "vitest"
import { runTranslationWorkbenchRequest } from "../translate-runner"

const executeTranslateMock = vi.hoisted(() => vi.fn(async () => "translated"))
const consumeQuotaMock = vi.hoisted(() => vi.fn(async () => ({
  bucket: "web_text_translate_monthly",
  remaining: 99,
  reset_at: null,
})))

vi.mock("@/utils/host/translate/execute-translate", () => ({
  executeTranslate: executeTranslateMock,
}))

vi.mock("@/utils/prompts/translate", () => ({
  getTranslatePrompt: vi.fn(),
}))

vi.mock("@/utils/orpc/client", () => ({
  orpcClient: {
    billing: {
      consumeQuota: consumeQuotaMock,
    },
  },
}))

const googleProvider = {
  id: "google-translate-default",
  name: "Google Translate",
  enabled: true,
  provider: "google-translate",
} as TranslateProviderConfig

const proProvider = {
  id: "getu-pro-default",
  name: "DeepSeek-V4-Pro",
  enabled: true,
  provider: "getu-pro",
  model: { model: "deepseek-v4-pro", isCustomModel: false, customModel: null },
} as TranslateProviderConfig

describe("runTranslationWorkbenchRequest", () => {
  it("does not call any provider for anonymous users", async () => {
    const results = await runTranslationWorkbenchRequest({
      plan: "anonymous",
      userId: null,
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-1",
      },
      providers: [googleProvider, proProvider],
      languageLevel: "intermediate",
    })

    expect(executeTranslateMock).not.toHaveBeenCalled()
    expect(consumeQuotaMock).not.toHaveBeenCalled()
    expect(results).toEqual([
      { providerId: "google-translate-default", status: "login-required" },
      { providerId: "getu-pro-default", status: "login-required" },
    ])
  })

  it("does not call gated Pro providers for logged-in free users", async () => {
    const results = await runTranslationWorkbenchRequest({
      plan: "free",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-2",
      },
      providers: [proProvider],
      languageLevel: "intermediate",
    })

    expect(executeTranslateMock).not.toHaveBeenCalled()
    expect(consumeQuotaMock).not.toHaveBeenCalled()
    expect(results).toEqual([
      { providerId: "getu-pro-default", status: "upgrade-required" },
    ])
  })

  it("consumes one web text click quota for signed-in runnable requests", async () => {
    await runTranslationWorkbenchRequest({
      plan: "free",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-3",
      },
      providers: [googleProvider],
      languageLevel: "intermediate",
    })

    expect(consumeQuotaMock).toHaveBeenCalledWith({
      bucket: "web_text_translate_monthly",
      amount: 1,
      request_id: "sidebar-web-text:click-3",
    })
  })

  it("uses a separate token request id for each GetU Pro provider call", async () => {
    await runTranslationWorkbenchRequest({
      plan: "pro",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-4",
      },
      providers: [proProvider],
      languageLevel: "intermediate",
    })

    expect(executeTranslateMock).toHaveBeenCalledWith(
      "hello",
      { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
      proProvider,
      expect.any(Function),
      expect.objectContaining({
        headers: {
          "x-request-id": "sidebar-web-text-token:click-4:getu-pro-default",
          "x-getu-quota-bucket": "web_text_translate_token_monthly",
        },
      }),
    )
  })

  it("returns an error result for one failed provider without clearing successful results", async () => {
    executeTranslateMock
      .mockResolvedValueOnce("first ok")
      .mockRejectedValueOnce(new Error("network failed"))

    const results = await runTranslationWorkbenchRequest({
      plan: "free",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-5",
      },
      providers: [
        googleProvider,
        { ...googleProvider, id: "microsoft-translate-default", name: "Microsoft Translate", provider: "microsoft-translate" } as TranslateProviderConfig,
      ],
      languageLevel: "intermediate",
    })

    expect(results).toEqual([
      { providerId: "google-translate-default", status: "success", text: "first ok" },
      { providerId: "microsoft-translate-default", status: "error", errorMessage: "network failed" },
    ])
  })
})
```

- [ ] **Step 2: Verify runner tests fail**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/components/translation-workbench/__tests__/translate-runner.test.ts
```

Expected: tests fail because `translate-runner.ts` does not exist.

- [ ] **Step 3: Implement the runner**

Create `apps/extension/src/components/translation-workbench/translate-runner.ts`:

```ts
import type { Config } from "@/types/config/config"
import type { TranslateProviderConfig } from "@/types/config/provider"
import { executeTranslate } from "@/utils/host/translate/execute-translate"
import { orpcClient } from "@/utils/orpc/client"
import { getTranslatePrompt } from "@/utils/prompts/translate"
import {
  buildSidebarClickRequestId,
  buildSidebarTokenRequestId,
  getProviderGate,
  isGetuProProvider,
} from "./provider-gating"
import type { TranslationRequestSnapshot, TranslationResultState, TranslationWorkbenchPlan } from "./types"

interface RunTranslationWorkbenchRequestInput {
  plan: TranslationWorkbenchPlan
  userId: string | null
  request: TranslationRequestSnapshot
  providers: TranslateProviderConfig[]
  languageLevel: Config["language"]["level"]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "translation failed"
}

export async function runTranslationWorkbenchRequest({
  plan,
  userId,
  request,
  providers,
  languageLevel,
}: RunTranslationWorkbenchRequestInput): Promise<TranslationResultState[]> {
  const runnable: TranslateProviderConfig[] = []
  const gated: TranslationResultState[] = []

  for (const provider of providers) {
    if (!provider.enabled) {
      gated.push({
        providerId: provider.id,
        status: "error",
        errorMessage: "Provider is disabled",
      })
      continue
    }

    const gate = getProviderGate(provider, plan)
    if (gate === "login-required" || gate === "upgrade-required") {
      gated.push({ providerId: provider.id, status: gate })
      continue
    }

    runnable.push(provider)
  }

  if (userId !== null && runnable.length > 0) {
    await orpcClient.billing.consumeQuota({
      bucket: "web_text_translate_monthly",
      amount: 1,
      request_id: buildSidebarClickRequestId(request.clickId),
    })
  }

  const settled = await Promise.all(
    runnable.map(async (provider): Promise<TranslationResultState> => {
      try {
        const headers = isGetuProProvider(provider)
          ? {
              "x-request-id": buildSidebarTokenRequestId(request.clickId, provider.id),
              "x-getu-quota-bucket": "web_text_translate_token_monthly",
            }
          : undefined

        const text = await executeTranslate(
          request.text,
          {
            sourceCode: request.sourceLanguage,
            targetCode: request.targetLanguage,
            level: languageLevel,
          },
          provider,
          getTranslatePrompt,
          headers ? { headers } : undefined,
        )

        return { providerId: provider.id, status: "success", text }
      } catch (error) {
        const message = errorMessage(error)
        const status = /quota|limit|exceeded|FORBIDDEN/i.test(message) ? "quota-exhausted" : "error"
        return { providerId: provider.id, status, errorMessage: message }
      }
    }),
  )

  return [...gated, ...settled]
}
```

- [ ] **Step 4: Verify runner tests pass**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/components/translation-workbench/__tests__/translate-runner.test.ts
```

Expected: all runner tests pass.

- [ ] **Step 5: Commit runner**

```bash
git add apps/extension/src/components/translation-workbench/translate-runner.ts apps/extension/src/components/translation-workbench/__tests__/translate-runner.test.ts
git commit -m "feat(extension): add sidebar translation runner"
```

---

## Task 5: Shared Workbench UI Components

**Files:**
- Create: `apps/extension/src/components/translation-workbench/language-picker.tsx`
- Create: `apps/extension/src/components/translation-workbench/provider-icon-stack.tsx`
- Create: `apps/extension/src/components/translation-workbench/provider-multi-select.tsx`
- Create: `apps/extension/src/components/translation-workbench/result-card.tsx`
- Create: `apps/extension/src/components/translation-workbench/__tests__/language-picker.test.tsx`
- Create: `apps/extension/src/components/translation-workbench/__tests__/result-card.test.tsx`

- [ ] **Step 1: Write language picker UI tests**

Create `apps/extension/src/components/translation-workbench/__tests__/language-picker.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { WorkbenchLanguagePicker } from "../language-picker"

vi.mock("@/utils/i18n", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

describe("WorkbenchLanguagePicker", () => {
  it("disables swap while source is auto", () => {
    render(
      <WorkbenchLanguagePicker
        source="auto"
        target="cmn"
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSwap={vi.fn()}
        portalContainer={document.body}
      />,
    )

    expect(screen.getByLabelText("translationWorkbench.swapLanguages")).toBeDisabled()
  })

  it("calls onSwap when source is concrete", () => {
    const onSwap = vi.fn()
    render(
      <WorkbenchLanguagePicker
        source="eng"
        target="cmn"
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSwap={onSwap}
        portalContainer={document.body}
      />,
    )

    fireEvent.click(screen.getByLabelText("translationWorkbench.swapLanguages"))
    expect(onSwap).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Write result card UI tests**

Create `apps/extension/src/components/translation-workbench/__tests__/result-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { TranslateProviderConfig } from "@/types/config/provider"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TranslationWorkbenchResultCard } from "../result-card"

vi.mock("@/components/provider-icon", () => ({
  default: ({ name }: { name: string }) => <span>{name}</span>,
}))

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}))

vi.mock("@/utils/constants/providers", () => ({
  PROVIDER_ITEMS: {
    "getu-pro": { logo: () => "logo.svg", name: "GetU Pro", website: "https://getutranslate.com" },
    "google-translate": { logo: () => "logo.svg", name: "Google Translate", website: "https://translate.google.com" },
  },
}))

vi.mock("@/utils/i18n", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

const provider = {
  id: "getu-pro-default",
  name: "DeepSeek-V4-Pro",
  enabled: true,
  provider: "getu-pro",
} as TranslateProviderConfig

describe("TranslationWorkbenchResultCard", () => {
  it("renders login-required state with login action", () => {
    const onLogin = vi.fn()
    render(
      <TranslationWorkbenchResultCard
        provider={provider}
        result={{ providerId: provider.id, status: "login-required" }}
        onRetry={vi.fn()}
        onLogin={onLogin}
        onUpgrade={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.loginAction" }))
    expect(onLogin).toHaveBeenCalledTimes(1)
  })

  it("renders successful text and copy action", () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } })
    render(
      <TranslationWorkbenchResultCard
        provider={provider}
        result={{ providerId: provider.id, status: "success", text: "你好" }}
        onRetry={vi.fn()}
        onLogin={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    )

    expect(screen.getByText("你好")).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText("translationWorkbench.copyResult"))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("你好")
  })
})
```

- [ ] **Step 3: Verify UI tests fail**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/components/translation-workbench/__tests__/language-picker.test.tsx src/components/translation-workbench/__tests__/result-card.test.tsx
```

Expected: tests fail because the UI components do not exist.

- [ ] **Step 4: Implement the language picker**

Create `apps/extension/src/components/translation-workbench/language-picker.tsx`:

```tsx
import type { LangCodeISO6393 } from "@getu/definitions"
import { Icon } from "@iconify/react"
import { Button } from "@/components/ui/base-ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { i18n } from "@/utils/i18n"
import {
  SIDEBAR_SOURCE_LANGUAGES,
  SIDEBAR_TARGET_LANGUAGES,
  fromSidebarLanguageCode,
  toSidebarLanguageCode,
  type SidebarLanguageCode,
} from "./language-options"

interface WorkbenchLanguagePickerProps {
  source: LangCodeISO6393 | "auto"
  target: LangCodeISO6393
  onSourceChange: (value: LangCodeISO6393 | "auto") => void
  onTargetChange: (value: LangCodeISO6393) => void
  onSwap: () => void
  portalContainer: HTMLElement
}

export function WorkbenchLanguagePicker({
  source,
  target,
  onSourceChange,
  onTargetChange,
  onSwap,
  portalContainer,
}: WorkbenchLanguagePickerProps) {
  return (
    <div className="border-border bg-muted/60 grid grid-cols-[1fr_auto_1fr] items-center overflow-hidden rounded-md border">
      <Select
        value={toSidebarLanguageCode(source)}
        onValueChange={value => onSourceChange(fromSidebarLanguageCode(value as SidebarLanguageCode))}
      >
        <SelectTrigger className="h-12 rounded-none border-0 bg-transparent px-4 font-medium shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent container={portalContainer}>
          {SIDEBAR_SOURCE_LANGUAGES.map(option => (
            <SelectItem key={option.code} value={option.code}>
              {i18n.t(option.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10 rounded-full"
        disabled={source === "auto"}
        aria-label={i18n.t("translationWorkbench.swapLanguages")}
        title={i18n.t("translationWorkbench.swapLanguages")}
        onClick={onSwap}
      >
        <Icon icon="tabler:arrows-exchange" className="size-5" />
      </Button>

      <Select
        value={toSidebarLanguageCode(target)}
        onValueChange={value => {
          const next = fromSidebarLanguageCode(value as SidebarLanguageCode)
          if (next !== "auto") onTargetChange(next)
        }}
      >
        <SelectTrigger className="h-12 rounded-none border-0 bg-transparent px-4 font-medium shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent container={portalContainer}>
          {SIDEBAR_TARGET_LANGUAGES.map(option => (
            <SelectItem key={option.code} value={option.code}>
              {i18n.t(option.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 5: Implement provider icon stack**

Create `apps/extension/src/components/translation-workbench/provider-icon-stack.tsx`:

```tsx
import type { TranslateProviderConfig } from "@/types/config/provider"
import ProviderIcon from "@/components/provider-icon"
import { useTheme } from "@/components/providers/theme-provider"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"
import { cn } from "@/utils/styles/utils"

export function ProviderIconStack({ providers, className }: { providers: TranslateProviderConfig[], className?: string }) {
  const { theme = "light" } = useTheme()
  const visible = providers.slice(0, 4)

  if (visible.length === 0) return null

  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((provider, index) => {
        const item = PROVIDER_ITEMS[provider.provider as keyof typeof PROVIDER_ITEMS]
        return (
          <span key={provider.id} className={cn("rounded-full bg-background ring-2 ring-background", index > 0 && "-ml-2")}>
            <ProviderIcon logo={item.logo(theme)} name={provider.name} size="sm" />
          </span>
        )
      })}
      {providers.length > visible.length && (
        <span className="-ml-2 grid size-7 place-items-center rounded-full bg-muted text-xs font-semibold ring-2 ring-background">
          +{providers.length - visible.length}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Implement provider multi-select**

Create `apps/extension/src/components/translation-workbench/provider-multi-select.tsx`:

```tsx
import type { TranslateProviderConfig } from "@/types/config/provider"
import { Icon } from "@iconify/react"
import ProviderIcon from "@/components/provider-icon"
import { useTheme } from "@/components/providers/theme-provider"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { isLLMProviderConfig } from "@/types/config/provider"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"
import { i18n } from "@/utils/i18n"
import { isGetuProProvider } from "./provider-gating"
import { ProviderIconStack } from "./provider-icon-stack"

interface ProviderMultiSelectProps {
  providers: TranslateProviderConfig[]
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
  portalContainer: HTMLElement
}

function groupProviders(providers: TranslateProviderConfig[]) {
  return {
    free: providers.filter(p => p.provider === "google-translate" || p.provider === "microsoft-translate" || p.provider === "bing-translate" || p.provider === "yandex-translate"),
    pro: providers.filter(isGetuProProvider),
    byok: providers.filter(p => !isGetuProProvider(p) && isLLMProviderConfig(p)),
    api: providers.filter(p => !isGetuProProvider(p) && !isLLMProviderConfig(p) && !["google-translate", "microsoft-translate", "bing-translate", "yandex-translate"].includes(p.provider)),
  }
}

export function ProviderMultiSelect({ providers, selectedIds, onSelectedIdsChange, portalContainer }: ProviderMultiSelectProps) {
  const { theme = "light" } = useTheme()
  const selectedProviders = selectedIds
    .map(id => providers.find(p => p.id === id))
    .filter((p): p is TranslateProviderConfig => p != null)
  const groups = groupProviders(providers)

  function renderItem(provider: TranslateProviderConfig) {
    const item = PROVIDER_ITEMS[provider.provider as keyof typeof PROVIDER_ITEMS]
    return (
      <SelectItem key={provider.id} value={provider.id}>
        <div className="flex w-full items-center justify-between gap-3">
          <ProviderIcon logo={item.logo(theme)} name={provider.name} size="sm" />
          {isGetuProProvider(provider) && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Pro</span>
          )}
        </div>
      </SelectItem>
    )
  }

  return (
    <Select multiple value={selectedIds} onValueChange={onSelectedIdsChange}>
      <SelectTrigger className="h-10 min-w-32 rounded-full border-0 bg-muted px-3 shadow-none">
        <SelectValue placeholder={i18n.t("translationWorkbench.selectProviders")}>
          <div className="flex items-center gap-2">
            <ProviderIconStack providers={selectedProviders} />
            <Icon icon="tabler:chevron-down" className="size-4 text-muted-foreground" />
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent container={portalContainer} className="w-72">
        {groups.free.length > 0 && (
          <SelectGroup>
            <SelectLabel>{i18n.t("translationWorkbench.freeProviders")}</SelectLabel>
            {groups.free.map(renderItem)}
          </SelectGroup>
        )}
        {groups.pro.length > 0 && (
          <SelectGroup>
            <SelectLabel>{i18n.t("translationWorkbench.proProviders")}</SelectLabel>
            {groups.pro.map(renderItem)}
          </SelectGroup>
        )}
        {groups.byok.length > 0 && (
          <SelectGroup>
            <SelectLabel>{i18n.t("translationWorkbench.byokProviders")}</SelectLabel>
            {groups.byok.map(renderItem)}
          </SelectGroup>
        )}
        {groups.api.length > 0 && (
          <SelectGroup>
            <SelectLabel>{i18n.t("translationWorkbench.apiProviders")}</SelectLabel>
            {groups.api.map(renderItem)}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}
```

- [ ] **Step 7: Implement result card**

Create `apps/extension/src/components/translation-workbench/result-card.tsx`:

```tsx
import type { TranslateProviderConfig } from "@/types/config/provider"
import { Icon } from "@iconify/react"
import { toast } from "sonner"
import ProviderIcon from "@/components/provider-icon"
import { useTheme } from "@/components/providers/theme-provider"
import { Button } from "@/components/ui/base-ui/button"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"
import { i18n } from "@/utils/i18n"
import type { TranslationResultState } from "./types"

interface ResultCardProps {
  provider: TranslateProviderConfig
  result: TranslationResultState
  onRetry: (providerId: string) => void
  onLogin: () => void
  onUpgrade: () => void
}

export function TranslationWorkbenchResultCard({ provider, result, onRetry, onLogin, onUpgrade }: ResultCardProps) {
  const { theme = "light" } = useTheme()
  const item = PROVIDER_ITEMS[provider.provider as keyof typeof PROVIDER_ITEMS]

  async function copyResult() {
    if (!result.text) return
    await navigator.clipboard.writeText(result.text)
    toast.success(i18n.t("translationWorkbench.copied"))
  }

  return (
    <article className="border-border bg-card rounded-md border p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <ProviderIcon logo={item.logo(theme)} name={provider.name} size="sm" />
        <div className="flex items-center gap-1">
          {result.status === "loading" && <Icon icon="tabler:loader-2" className="size-4 animate-spin text-muted-foreground" />}
          {result.status === "success" && (
            <Button variant="ghost" size="icon" className="size-8" aria-label={i18n.t("translationWorkbench.copyResult")} onClick={copyResult}>
              <Icon icon="tabler:copy" className="size-4" />
            </Button>
          )}
          {(result.status === "error" || result.status === "quota-exhausted") && (
            <Button variant="ghost" size="icon" className="size-8" aria-label={i18n.t("translationWorkbench.retry")} onClick={() => onRetry(provider.id)}>
              <Icon icon="tabler:refresh" className="size-4" />
            </Button>
          )}
        </div>
      </header>

      {result.status === "loading" && (
        <p className="text-sm text-muted-foreground">{i18n.t("translationWorkbench.loading")}</p>
      )}
      {result.status === "success" && (
        <p className="whitespace-pre-wrap text-base leading-relaxed">{result.text}</p>
      )}
      {result.status === "error" && (
        <p className="text-sm text-destructive">{result.errorMessage ?? i18n.t("translationWorkbench.errorFallback")}</p>
      )}
      {result.status === "quota-exhausted" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{i18n.t("translationWorkbench.quotaExhausted")}</p>
          <Button size="sm" onClick={onUpgrade}>{i18n.t("translationWorkbench.upgradeAction")}</Button>
        </div>
      )}
      {result.status === "login-required" && (
        <div className="space-y-3 rounded-md bg-muted p-4 text-center">
          <p className="text-sm text-muted-foreground">{i18n.t("translationWorkbench.loginRequired")}</p>
          <Button size="sm" onClick={onLogin}>{i18n.t("translationWorkbench.loginAction")}</Button>
        </div>
      )}
      {result.status === "upgrade-required" && (
        <div className="space-y-3 rounded-md bg-primary/10 p-4 text-center">
          <p className="text-sm text-muted-foreground">{i18n.t("translationWorkbench.upgradeRequired")}</p>
          <Button size="sm" onClick={onUpgrade}>{i18n.t("translationWorkbench.upgradeAction")}</Button>
        </div>
      )}
      {result.status === "idle" && (
        <p className="text-sm text-muted-foreground">{i18n.t("translationWorkbench.idle")}</p>
      )}
    </article>
  )
}
```

- [ ] **Step 8: Verify workbench UI tests pass**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/components/translation-workbench/__tests__/language-picker.test.tsx src/components/translation-workbench/__tests__/result-card.test.tsx
```

Expected: both test files pass.

- [ ] **Step 9: Commit shared UI**

```bash
git add apps/extension/src/components/translation-workbench
git commit -m "feat(extension): add translation workbench ui"
```

---

## Task 6: Sidebar Text And Document Tabs

**Files:**
- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/index.tsx`
- Create: `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-shell.tsx`
- Create: `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx`
- Create: `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-document-tab.tsx`
- Create: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx`
- Create: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-document-tab.test.tsx`
- Create: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/side-content-reflow.test.tsx`

- [ ] **Step 1: Write sidebar shell tests**

Create `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { atom, createStore, Provider as JotaiProvider } from "jotai"
import { describe, expect, it, vi } from "vitest"
import { isSideOpenAtom } from "../../../atoms"
import { SidebarShell } from "../sidebar-shell"

vi.mock("#imports", () => ({
  browser: { tabs: { create: vi.fn() } },
}))

vi.mock("@/utils/i18n", () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: {
    language: atom({ sourceCode: "auto", targetCode: "cmn", level: "intermediate" }),
    providersConfig: atom([]),
  },
}))

vi.mock("../../../index", () => ({
  shadowWrapper: document.body,
}))

function renderWithStore(ui: React.ReactNode) {
  const store = createStore()
  store.set(isSideOpenAtom, true)
  return {
    store,
    ...render(<JotaiProvider store={store}>{ui}</JotaiProvider>),
  }
}

describe("SidebarShell", () => {
  it("switches between text and document tabs", () => {
    renderWithStore(<SidebarShell />)

    expect(screen.getByRole("heading", { name: "translationWorkbench.textTitle" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: "translationWorkbench.documentTab" }))
    expect(screen.getByRole("heading", { name: "translationWorkbench.documentTitle" })).toBeInTheDocument()
  })

  it("closes the sidebar", () => {
    const { store } = renderWithStore(<SidebarShell />)

    fireEvent.click(screen.getByLabelText("translationWorkbench.closeSidebar"))
    expect(store.get(isSideOpenAtom)).toBe(false)
  })
})
```

- [ ] **Step 2: Write document tab tests**

Create `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-document-tab.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SidebarDocumentTab } from "../sidebar-document-tab"

const createTabMock = vi.hoisted(() => vi.fn())

vi.mock("#imports", () => ({
  browser: { tabs: { create: createTabMock } },
}))

vi.mock("@/utils/constants/url", () => ({
  WEB_DOCUMENT_TRANSLATE_URL: "https://getutranslate.com/document/",
}))

vi.mock("@/utils/i18n", () => ({
  i18n: { t: (key: string) => key },
}))

describe("SidebarDocumentTab", () => {
  it("renders supported document formats and opens the website upload page", () => {
    render(<SidebarDocumentTab />)

    for (const label of ["PDF", "EPUB", "DOCX", "TXT", "HTML", "MD", "SRT", "ASS", "VTT", "LRC"]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.uploadDocument" }))
    expect(createTabMock).toHaveBeenCalledWith({ url: "https://getutranslate.com/document/" })
  })
})
```

- [ ] **Step 3: Write side content reflow test**

Create `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/side-content-reflow.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { atom, createStore, Provider as JotaiProvider } from "jotai"
import { describe, expect, it, vi } from "vitest"
import { isSideOpenAtom } from "../../../atoms"
import SideContent from ".."

vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: {
    sideContent: atom({ width: 420 }),
    language: atom({ sourceCode: "auto", targetCode: "cmn", level: "intermediate" }),
    providersConfig: atom([]),
  },
}))

vi.mock("@/utils/i18n", () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock("../../../index", () => ({
  shadowWrapper: document.body,
}))

describe("SideContent page reflow", () => {
  it("shrinks html width while open", () => {
    const store = createStore()
    store.set(isSideOpenAtom, true)

    render(
      <JotaiProvider store={store}>
        <SideContent />
      </JotaiProvider>,
    )

    const style = document.getElementById("shrink-origin-for-getu-translate-side-content")
    expect(style?.textContent).toContain("width: calc(100% - 420px)")
  })
})
```

- [ ] **Step 4: Verify sidebar tests fail**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx src/entrypoints/side.content/components/side-content/__tests__/sidebar-document-tab.test.tsx src/entrypoints/side.content/components/side-content/__tests__/side-content-reflow.test.tsx
```

Expected: tests fail because the sidebar components do not exist.

- [ ] **Step 5: Implement sidebar shell**

Create `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-shell.tsx`:

```tsx
import { Icon } from "@iconify/react"
import { useSetAtom } from "jotai"
import { useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { i18n } from "@/utils/i18n"
import { cn } from "@/utils/styles/utils"
import { isSideOpenAtom } from "../../atoms"
import { SidebarDocumentTab } from "./sidebar-document-tab"
import { SidebarTextTab } from "./sidebar-text-tab"

type SidebarTab = "text" | "document"

export function SidebarShell() {
  const [activeTab, setActiveTab] = useState<SidebarTab>("text")
  const setIsSideOpen = useSetAtom(isSideOpenAtom)

  return (
    <div className="bg-background text-foreground flex h-full min-h-0 overflow-hidden">
      <main className="min-w-0 flex-1 overflow-y-auto px-8 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-normal">
            {activeTab === "text" ? i18n.t("translationWorkbench.textTitle") : i18n.t("translationWorkbench.documentTitle")}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            aria-label={i18n.t("translationWorkbench.closeSidebar")}
            onClick={() => setIsSideOpen(false)}
          >
            <Icon icon="tabler:x" className="size-5" />
          </Button>
        </div>
        {activeTab === "text" ? <SidebarTextTab /> : <SidebarDocumentTab />}
      </main>

      <aside className="border-border bg-muted/30 flex w-20 shrink-0 flex-col items-center gap-4 border-l py-6" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "text"}
          className={cn("flex flex-col items-center gap-1 rounded-md px-2 py-3 text-sm font-medium", activeTab === "text" && "bg-primary/10 text-primary ring-1 ring-primary/40")}
          onClick={() => setActiveTab("text")}
        >
          <Icon icon="tabler:letter-t" className="size-6" />
          {i18n.t("translationWorkbench.textTab")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "document"}
          className={cn("flex flex-col items-center gap-1 rounded-md px-2 py-3 text-sm font-medium", activeTab === "document" && "bg-primary/10 text-primary ring-1 ring-primary/40")}
          onClick={() => setActiveTab("document")}
        >
          <Icon icon="tabler:file-type-pdf" className="size-6" />
          {i18n.t("translationWorkbench.documentTab")}
        </button>
      </aside>
    </div>
  )
}
```

- [ ] **Step 6: Implement document tab**

Create `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-document-tab.tsx`:

```tsx
import { browser } from "#imports"
import { Icon } from "@iconify/react"
import { Button } from "@/components/ui/base-ui/button"
import { WEB_DOCUMENT_TRANSLATE_URL } from "@/utils/constants/url"
import { i18n } from "@/utils/i18n"
import { cn } from "@/utils/styles/utils"

const FORMATS = [
  { label: "PDF", icon: "tabler:file-type-pdf", tone: "text-pink-500 bg-pink-500/10" },
  { label: "EPUB", icon: "tabler:file-type-pdf", tone: "text-emerald-500 bg-emerald-500/10" },
  { label: "DOCX", icon: "tabler:file-type-docx", tone: "text-blue-500 bg-blue-500/10" },
  { label: "TXT", icon: "tabler:file-type-txt", tone: "text-muted-foreground bg-muted" },
  { label: "HTML", icon: "tabler:file-type-html", tone: "text-muted-foreground bg-muted" },
  { label: "MD", icon: "tabler:markdown", tone: "text-muted-foreground bg-muted" },
  { label: "SRT", icon: "tabler:file-description", tone: "text-violet-500 bg-violet-500/10" },
  { label: "ASS", icon: "tabler:file-description", tone: "text-violet-500 bg-violet-500/10" },
  { label: "VTT", icon: "tabler:file-description", tone: "text-violet-500 bg-violet-500/10" },
  { label: "LRC", icon: "tabler:file-description", tone: "text-violet-500 bg-violet-500/10" },
]

const FEATURES = [
  { titleKey: "translationWorkbench.pdfProTitle", bodyKey: "translationWorkbench.pdfProBody", icon: "tabler:scan" },
  { titleKey: "translationWorkbench.babelDocTitle", bodyKey: "translationWorkbench.babelDocBody", icon: "tabler:layout" },
  { titleKey: "translationWorkbench.subtitleTitle", bodyKey: "translationWorkbench.subtitleBody", icon: "tabler:captions" },
]

export function SidebarDocumentTab() {
  return (
    <div className="space-y-7">
      <p className="max-w-2xl text-base leading-7 text-muted-foreground">
        {i18n.t("translationWorkbench.documentDescription")}
      </p>
      <a className="text-sm font-semibold text-muted-foreground underline" href={WEB_DOCUMENT_TRANSLATE_URL} target="_blank" rel="noreferrer">
        {i18n.t("translationWorkbench.learnMore")}
      </a>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{i18n.t("translationWorkbench.documentFeatures")}</h2>
        <div className="grid grid-cols-4 gap-3">
          {FORMATS.map(format => (
            <div key={format.label} className={cn("grid h-20 place-items-center rounded-md", format.tone)}>
              <div className="flex flex-col items-center gap-1">
                <Icon icon={format.icon} className="size-8" />
                <span className="text-xs font-bold">{format.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Button className="h-14 w-full text-lg font-bold" onClick={() => void browser.tabs.create({ url: WEB_DOCUMENT_TRANSLATE_URL })}>
        {i18n.t("translationWorkbench.uploadDocument")}
        <Icon icon="tabler:arrow-up-right" className="ml-2 size-5" />
      </Button>

      <div className="space-y-4">
        {FEATURES.map(feature => (
          <section key={feature.titleKey} className="border-border grid grid-cols-[1fr_160px] items-center gap-4 rounded-md border p-5">
            <div className="space-y-3">
              <h3 className="text-lg font-bold">{i18n.t(feature.titleKey)}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{i18n.t(feature.bodyKey)}</p>
            </div>
            <div className="grid aspect-square place-items-center rounded-md bg-primary/10">
              <Icon icon={feature.icon} className="size-16 text-primary" />
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Implement text tab**

Create `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx`:

```tsx
import type { TranslationResultState } from "@/components/translation-workbench/types"
import { browser } from "#imports"
import { Icon } from "@iconify/react"
import { useAtom, useAtomValue } from "jotai"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ProviderMultiSelect } from "@/components/translation-workbench/provider-multi-select"
import { getTextTranslateCharLimit, planFromEntitlements } from "@/components/translation-workbench/provider-gating"
import { TranslationWorkbenchResultCard } from "@/components/translation-workbench/result-card"
import { runTranslationWorkbenchRequest } from "@/components/translation-workbench/translate-runner"
import { WorkbenchLanguagePicker } from "@/components/translation-workbench/language-picker"
import { Button } from "@/components/ui/base-ui/button"
import { Textarea } from "@/components/ui/base-ui/textarea"
import { useEntitlements } from "@/hooks/use-entitlements"
import type { TranslateProviderConfig } from "@/types/config/provider"
import { authClient } from "@/utils/auth/auth-client"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { filterEnabledProvidersConfig, getTranslateProvidersConfig } from "@/utils/config/helpers"
import { WEBSITE_URL } from "@/utils/constants/url"
import { i18n } from "@/utils/i18n"
import { shadowWrapper } from "../../index"

export function SidebarTextTab() {
  const [language, setLanguage] = useAtom(configFieldsAtomMap.language)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const session = authClient.useSession()
  const userId = session.data?.user?.id ?? null
  const { data: entitlements } = useEntitlements(userId)
  const plan = planFromEntitlements(userId, entitlements)
  const charLimit = getTextTranslateCharLimit(plan)

  const providers = useMemo(
    () => filterEnabledProvidersConfig(getTranslateProvidersConfig(providersConfig)) as TranslateProviderConfig[],
    [providersConfig],
  )
  const [selectedIds, setSelectedIds] = useState<string[]>(() => providers.slice(0, 3).map(p => p.id))
  const selectedProviders = selectedIds
    .map(id => providers.find(p => p.id === id))
    .filter((p): p is typeof providers[number] => p != null)

  useEffect(() => {
    if (selectedIds.length === 0 && providers.length > 0) {
      setSelectedIds(providers.slice(0, 3).map(p => p.id))
    }
  }, [providers, selectedIds.length])

  const [text, setText] = useState("")
  const [results, setResults] = useState<Record<string, TranslationResultState>>({})
  const [isTranslating, setIsTranslating] = useState(false)
  const overLimit = text.length > charLimit

  function swapLanguages() {
    if (language.sourceCode === "auto") return
    void setLanguage({ ...language, sourceCode: language.targetCode, targetCode: language.sourceCode })
  }

  async function translate(providerIds = selectedIds) {
    const trimmed = text.trim()
    if (!trimmed || overLimit || isTranslating) return
    const providersToRun = providerIds
      .map(id => providers.find(p => p.id === id))
      .filter((p): p is typeof providers[number] => p != null)
    if (providersToRun.length === 0) return

    const clickId = crypto.randomUUID()
    setIsTranslating(true)
    setResults(prev => {
      const next = { ...prev }
      for (const provider of providersToRun) next[provider.id] = { providerId: provider.id, status: "loading" }
      return next
    })

    try {
      const nextResults = await runTranslationWorkbenchRequest({
        plan,
        userId,
        request: {
          text: trimmed,
          sourceLanguage: language.sourceCode,
          targetLanguage: language.targetCode,
          clickId,
        },
        providers: providersToRun,
        languageLevel: language.level,
      })
      setResults(prev => {
        const next = { ...prev }
        for (const result of nextResults) next[result.providerId] = result
        return next
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : i18n.t("translationWorkbench.errorFallback")
      toast.error(message)
      setResults(prev => {
        const next = { ...prev }
        for (const provider of providersToRun) {
          next[provider.id] = { providerId: provider.id, status: "error", errorMessage: message }
        }
        return next
      })
    } finally {
      setIsTranslating(false)
    }
  }

  function login() {
    void browser.tabs.create({ url: `${WEBSITE_URL}/log-in?redirect=/` })
  }

  function upgrade() {
    void browser.tabs.create({ url: `${WEBSITE_URL}/pricing` })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ProviderMultiSelect
          providers={providers}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          portalContainer={shadowWrapper}
        />
      </div>

      <section className="border-border overflow-hidden rounded-md border">
        <WorkbenchLanguagePicker
          source={language.sourceCode}
          target={language.targetCode}
          onSourceChange={sourceCode => void setLanguage({ ...language, sourceCode })}
          onTargetChange={targetCode => void setLanguage({ ...language, targetCode })}
          onSwap={swapLanguages}
          portalContainer={shadowWrapper}
        />
        <div className="relative">
          <Textarea
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder={i18n.t("translationWorkbench.inputPlaceholder")}
            className="h-72 resize-none rounded-none border-0 bg-background p-6 text-lg shadow-none"
            style={{ userSelect: "text" }}
          />
          <div className="absolute bottom-4 left-4 text-xs text-muted-foreground">
            <span className={overLimit ? "text-destructive" : ""}>{text.length}</span> / {charLimit}
          </div>
          <Button
            className="absolute bottom-4 right-4 h-12 px-7 text-base font-bold"
            disabled={!text.trim() || overLimit || selectedIds.length === 0 || isTranslating}
            onClick={() => void translate()}
          >
            {isTranslating ? i18n.t("translationWorkbench.loading") : i18n.t("translationWorkbench.translate")}
            <Icon icon="tabler:corner-down-left" className="ml-2 size-5" />
          </Button>
        </div>
      </section>

      {overLimit && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {i18n.t("translationWorkbench.charLimitExceeded", [charLimit])}
        </p>
      )}

      <div className="space-y-4">
        {selectedProviders.map(provider => (
          <TranslationWorkbenchResultCard
            key={provider.id}
            provider={provider}
            result={results[provider.id] ?? { providerId: provider.id, status: "idle" }}
            onRetry={providerId => void translate([providerId])}
            onLogin={login}
            onUpgrade={upgrade}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Replace the current body in SideContent**

In `apps/extension/src/entrypoints/side.content/components/side-content/index.tsx`, import the shell:

```ts
import { SidebarShell } from "./sidebar-shell"
```

Replace the current temporary body:

```tsx
        <div className="flex h-full flex-col gap-y-2 py-3 items-center justify-center">
          The function is being upgraded
        </div>
```

with:

```tsx
        <SidebarShell />
```

- [ ] **Step 9: Verify sidebar tests pass**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx src/entrypoints/side.content/components/side-content/__tests__/sidebar-document-tab.test.tsx src/entrypoints/side.content/components/side-content/__tests__/side-content-reflow.test.tsx
```

Expected: all sidebar tests pass.

- [ ] **Step 10: Commit sidebar UI**

```bash
git add apps/extension/src/entrypoints/side.content/components/side-content
git commit -m "feat(extension): add translation sidebar tabs"
```

---

## Task 7: Floating Button Open-Panel Tab

**Files:**
- Modify: `apps/extension/src/entrypoints/side.content/components/floating-button/index.tsx`
- Modify: `apps/extension/src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx`

- [ ] **Step 1: Add failing floating button tests**

Append these tests to `apps/extension/src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx`:

```tsx
  it("renders an open panel tab that is hidden until hover or focus", () => {
    render(<FloatingButton />)

    const openPanelTab = screen.getByRole("button", { name: "Open translation panel" })

    expect(openPanelTab).toHaveClass("invisible")
    expect(openPanelTab).toHaveClass("group-hover:visible")
    expect(openPanelTab).not.toHaveClass("hidden")
  })

  it("opens the sidebar from the open panel tab without using the main logo click action", () => {
    render(<FloatingButton />)

    const openPanelTab = screen.getByRole("button", { name: "Open translation panel" })
    fireEvent.click(openPanelTab)

    expect(sendMessage).not.toHaveBeenCalledWith("tryToSetEnablePageTranslationOnContentScript", expect.anything())
    expect(openPanelTab).toHaveClass("visible")
  })
```

Update the `@/utils/message` mock at the top of the test so `sendMessage` can be asserted:

```tsx
const sendMessageMock = vi.hoisted(() => vi.fn())

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))
```

Then import it for assertions:

```tsx
import { sendMessage } from "@/utils/message"
```

- [ ] **Step 2: Verify floating button tests fail**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx
```

Expected: the new tests fail because there is no open-panel tab.

- [ ] **Step 3: Implement the tab**

In `apps/extension/src/entrypoints/side.content/components/floating-button/index.tsx`, update the icon import:

```ts
import { IconLayoutSidebarRightCollapse, IconSettings, IconX } from "@tabler/icons-react"
```

Add the tab before the main logo `<div>`:

```tsx
      <button
        type="button"
        aria-label="Open translation panel"
        title="Open translation panel"
        className={cn(
          "border-border invisible flex h-9 items-center gap-2 rounded-l-full border border-r-0 bg-white px-3 text-sm font-medium opacity-0 shadow-lg transition-all duration-200 dark:bg-neutral-900",
          "group-hover:visible group-hover:opacity-100 focus:visible focus:opacity-100",
          isSideOpen && "visible opacity-100",
          attachSideClassName,
        )}
        onMouseDown={e => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsSideOpen(true)
        }}
      >
        <IconLayoutSidebarRightCollapse className="size-4" />
        <span>{i18n.t("translationWorkbench.openPanel")}</span>
      </button>
```

Keep `handleButtonDragStart` and the logo button unchanged so the configured `clickAction` still controls the original click behavior.

- [ ] **Step 4: Verify floating button tests pass**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx
```

Expected: all floating button tests pass.

- [ ] **Step 5: Commit floating tab**

```bash
git add apps/extension/src/entrypoints/side.content/components/floating-button/index.tsx apps/extension/src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx
git commit -m "feat(extension): open sidebar from floating button tab"
```

---

## Task 8: Auth Refresh And i18n Copy

**Files:**
- Create: `apps/extension/src/components/translation-workbench/use-auth-refresh.ts`
- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx`
- Modify: `apps/extension/src/locales/en.yml`
- Modify: `apps/extension/src/locales/zh-CN.yml`

- [ ] **Step 1: Add the auth refresh hook**

Create `apps/extension/src/components/translation-workbench/use-auth-refresh.ts`:

```ts
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { authClient } from "@/utils/auth/auth-client"

export function useAuthRefreshOnFocus(userId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    let disposed = false

    async function refresh() {
      if (document.visibilityState === "hidden") return
      await authClient.getSession()
      if (!disposed) {
        await queryClient.invalidateQueries({ queryKey: ["entitlements", userId] })
      }
    }

    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)

    return () => {
      disposed = true
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [queryClient, userId])
}
```

In `sidebar-text-tab.tsx`, import and call it after `userId` is computed:

```ts
import { useAuthRefreshOnFocus } from "@/components/translation-workbench/use-auth-refresh"
```

```ts
  useAuthRefreshOnFocus(userId)
```

- [ ] **Step 2: Add English copy**

Append this top-level section to `apps/extension/src/locales/en.yml`:

```yml
translationWorkbench:
  openPanel: Open panel
  closeSidebar: Close sidebar
  textTab: Text
  documentTab: Document
  textTitle: Translate text
  documentTitle: Document translation
  inputPlaceholder: Enter or paste text...
  translate: Translate
  loading: Translating...
  idle: Waiting for translation
  copied: Translation copied
  copyResult: Copy translation
  retry: Retry translation
  selectProviders: Select providers
  freeProviders: Free users
  proProviders: Pro models
  byokProviders: Your API providers
  apiProviders: API translators
  swapLanguages: Swap source and target languages
  charLimitExceeded: Input exceeds the current $1 character limit.
  errorFallback: Translation failed
  loginRequired: This model requires login before it can be used.
  loginAction: Log in
  upgradeRequired: This model is available for Pro members.
  upgradeAction: Upgrade to Pro
  quotaExhausted: This period's text translation quota has been used.
  documentDescription: Basic document translation supports PDF, EPUB, HTML, TXT, DOCX, Markdown, and subtitle files. PDF Pro supports OCR scanned files. BabelDOC preserves layout for bilingual PDF translation.
  learnMore: Learn more
  documentFeatures: Document translation features
  uploadDocument: Upload file
  pdfProTitle: PDF Pro
  pdfProBody: Translate scanned OCR PDFs while preserving formulas and tables.
  babelDocTitle: BabelDOC
  babelDocBody: Preserve original PDF layout, formulas, images, and tables for precise bilingual documents.
  subtitleTitle: Subtitle files
  subtitleBody: Edit and export bilingual subtitles for reuse, study, and creative projects.
  languages:
    auto: Auto detect
```

- [ ] **Step 3: Add Chinese copy**

Append this top-level section to `apps/extension/src/locales/zh-CN.yml`:

```yml
translationWorkbench:
  openPanel: 打开面板
  closeSidebar: 关闭侧边栏
  textTab: 文本
  documentTab: 文档
  textTitle: 翻译文本
  documentTitle: 文档翻译
  inputPlaceholder: 请输入或粘贴文本...
  translate: 翻译
  loading: 翻译中...
  idle: 等待翻译
  copied: 已复制翻译结果
  copyResult: 复制翻译
  retry: 重新翻译
  selectProviders: 选择模型
  freeProviders: 免费用户
  proProviders: Pro 会员模型
  byokProviders: 自有 API 模型
  apiProviders: API 翻译
  swapLanguages: 交换源语言和目标语言
  charLimitExceeded: 输入内容超过当前 $1 字符限制。
  errorFallback: 翻译失败
  loginRequired: 该模型需要登录后使用。
  loginAction: 去登录
  upgradeRequired: 该模型为 Pro 会员专用模型。
  upgradeAction: 升级 Pro
  quotaExhausted: 本周期文本翻译额度已用完。
  documentDescription: 基础文档翻译支持 PDF、EPUB、HTML、TXT、DOCX、Markdown、字幕等多种格式。PDF Pro 支持 OCR 扫描件翻译。BabelDOC 可保留原格式双语对照翻译。
  learnMore: 查看更多介绍
  documentFeatures: 文档翻译功能
  uploadDocument: 上传文件
  pdfProTitle: PDF Pro
  pdfProBody: 轻松翻译基于扫描的 OCR PDF，同时保留公式和表格。
  babelDocTitle: BabelDOC
  babelDocBody: 保留 PDF 原始布局、公式、图片和表格，以实现精确的双语文档翻译。
  subtitleTitle: 各种字幕文件
  subtitleBody: 编辑并导出双语字幕以便复用、学习或创意项目。
  languages:
    auto: 自动检测
```

- [ ] **Step 4: Regenerate WXT i18n artifacts**

Run:

```bash
pnpm --filter @getu/extension exec wxt prepare
```

Expected: WXT prepares extension metadata without errors.

- [ ] **Step 5: Commit auth refresh and copy**

```bash
git add apps/extension/src/components/translation-workbench/use-auth-refresh.ts apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx apps/extension/src/locales/en.yml apps/extension/src/locales/zh-CN.yml apps/extension/.wxt
git commit -m "feat(extension): refresh sidebar auth state"
```

---

## Task 9: Reuse Workbench Helpers In Translation Hub

**Files:**
- Modify: `apps/extension/src/entrypoints/translation-hub/atoms.ts`
- Modify: `apps/extension/src/entrypoints/translation-hub/components/text-input.tsx`
- Modify: `apps/extension/src/entrypoints/translation-hub/components/language-control-panel.tsx`
- Modify: `apps/extension/src/entrypoints/translation-hub/components/translation-service-dropdown.tsx`
- Modify: `apps/extension/src/entrypoints/translation-hub/components/translation-card.tsx`

- [ ] **Step 1: Add click ids to translation hub requests**

In `apps/extension/src/entrypoints/translation-hub/atoms.ts`, replace the local `TranslateRequest` interface with:

```ts
export interface TranslateRequest {
  inputText: string
  sourceLanguage: LangCodeISO6393 | "auto"
  targetLanguage: LangCodeISO6393
  timestamp: number
  clickId: string
}
```

Update `TextInput` in `apps/extension/src/entrypoints/translation-hub/components/text-input.tsx` so it sets `clickId`:

```ts
    setTranslateRequest({
      inputText: value,
      sourceLanguage: sourceLangCode,
      targetLanguage: targetLangCode,
      timestamp: Date.now(),
      clickId: crypto.randomUUID(),
    })
```

- [ ] **Step 2: Reuse shared provider gating in translation card**

In `apps/extension/src/entrypoints/translation-hub/components/translation-card.tsx`, import:

```ts
import { isGetuProProvider, buildSidebarTokenRequestId } from "@/components/translation-workbench/provider-gating"
```

When calling `executeTranslate`, pass token-bucket headers for GetU Pro providers:

```ts
          const headers = isGetuProProvider(provider)
            ? {
                "x-request-id": buildSidebarTokenRequestId(req.clickId, provider.id),
                "x-getu-quota-bucket": "web_text_translate_token_monthly",
              }
            : undefined

          const result = await executeTranslate(req.inputText, {
            sourceCode: req.sourceLanguage,
            targetCode: req.targetLanguage,
            level: language.level,
          }, provider, getTranslatePrompt, headers ? { headers } : undefined)
```

- [ ] **Step 3: Verify translation hub still passes existing tests**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/entrypoints/translation-hub src/utils/host/translate/api/__tests__/ai.test.ts
```

Expected: translation hub tests and AI header tests pass. If Vitest reports no tests under `translation-hub`, the command exits successfully for the AI test file and no hub regression test existed before this change.

- [ ] **Step 4: Commit translation hub helper reuse**

```bash
git add apps/extension/src/entrypoints/translation-hub
git commit -m "refactor(extension): reuse translation workbench helpers"
```

---

## Task 10: Full Verification

**Files:**
- No source changes unless verification finds a defect.

- [ ] **Step 1: Run focused API tests**

Run:

```bash
pnpm --filter @getu/api test -- src/ai/__tests__/proxy.test.ts src/orpc/__tests__/translate.test.ts src/billing/__tests__/quota.test.ts
```

Expected: all focused API tests pass.

- [ ] **Step 2: Run focused extension tests**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/components/translation-workbench src/entrypoints/side.content/components src/utils/host/translate/api/__tests__/ai.test.ts src/utils/host/translate/__tests__/execute-translate.test.ts
```

Expected: all focused extension tests pass.

- [ ] **Step 3: Run extension type-check**

Run:

```bash
pnpm --filter @getu/extension type-check
```

Expected: TypeScript exits with code 0.

- [ ] **Step 4: Run API type-check**

Run:

```bash
pnpm --filter @getu/api type-check
```

Expected: TypeScript exits with code 0.

- [ ] **Step 5: Run lint on changed workspaces**

Run:

```bash
pnpm --filter @getu/extension lint
pnpm --filter @getu/api lint
```

Expected: ESLint exits with code 0 for both workspaces.

- [ ] **Step 6: Build extension**

Run:

```bash
pnpm --filter @getu/extension build
```

Expected: WXT build completes and writes extension output under `apps/extension/.output/`.

- [ ] **Step 7: Manual browser check**

Run the extension dev server:

```bash
pnpm --filter @getu/extension dev
```

Expected: WXT starts and prints a browser extension dev build path. Load the unpacked extension in a browser, open any normal webpage, and verify:

- The floating ball still keeps its configured click behavior.
- Hovering or focusing the floating ball reveals "打开面板 / Open panel".
- Clicking the open panel tab opens the sidebar and page content shifts left.
- Text tab allows Google/Microsoft translation for free providers.
- Anonymous user selecting a GetU Pro provider sees a login-required card after translate and no provider request is made.
- After login on the website, returning focus to the original tab updates the sidebar session state.
- Logged-in free user selecting a GetU Pro provider sees an upgrade-required card after translate and no provider request is made.
- Pro user selecting a GetU Pro provider sends AI proxy requests with `x-getu-quota-bucket: web_text_translate_token_monthly`.
- Document tab upload opens `https://getutranslate.com/document/` in a new tab.

- [ ] **Step 8: Commit verification fixes if any source changed**

If verification required fixes:

```bash
git add <changed-files>
git commit -m "fix(extension): polish sidebar verification issues"
```

If no source changed after verification, no commit is needed.

---

## Risk Controls

- Keep `side.content` page reflow logic in `index.tsx`; only replace the drawer contents.
- Do not call GetU Pro providers for anonymous or free users. Gating happens before `executeTranslate()`.
- Do not reuse the same token `request_id` across selected GetU Pro providers; token usage must charge per model call.
- Use one shared click id for the separate `web_text_translate_monthly` consume call.
- Keep every popup/select portal inside the sidebar Shadow DOM by passing `shadowWrapper`.
- Do not add new browser permissions.
- Do not disable or delete providers in config when the user deselects them in the sidebar.
