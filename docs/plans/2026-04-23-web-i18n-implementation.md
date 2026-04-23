# Web I18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add static-export-friendly website localization for English, Simplified Chinese, and Traditional Chinese with automatic root language selection and a remembered manual language switcher.

**Architecture:** Move website pages under `apps/web/app/[locale]/...`, generate all supported locales at build time, and keep `/` as a tiny client-side language entry page. Use a small typed i18n module in `apps/web/lib/i18n/` for locale matching, route generation, same-page switching, and page messages.

**Tech Stack:** Next.js 15 App Router static export, React 19, TypeScript, Vitest for web i18n unit tests, Cloudflare Pages static output.

---

## Source Spec

- Design: `docs/plans/2026-04-23-web-i18n-design.md`

## File Structure

Create:

- `apps/web/lib/i18n/locales.ts` — supported locale constants, labels, storage key, browser-language matching, root redirect target selection.
- `apps/web/lib/i18n/routing.ts` — locale-aware href generation and same-page locale switching.
- `apps/web/lib/i18n/messages.ts` — typed message catalog for `en`, `zh-CN`, `zh-TW`.
- `apps/web/lib/i18n/__tests__/locales.test.ts` — unit tests for locale detection and root target selection.
- `apps/web/lib/i18n/__tests__/routing.test.ts` — unit tests for locale href and same-page switching.
- `apps/web/app/[locale]/layout.tsx` — validates locale params, generates static params, renders locale-scoped shell metadata.
- `apps/web/app/[locale]/page.tsx` — localized home page.
- `apps/web/app/[locale]/price/page.tsx` — localized price page.
- `apps/web/app/[locale]/price/UpgradeButton.tsx` — checkout button using locale-specific return URLs and localized UI strings.
- `apps/web/app/[locale]/log-in/page.tsx` — localized login page with locale-specific social callback.
- `apps/web/app/[locale]/upgrade/success/page.tsx` — localized upgrade success page.
- `apps/web/app/[locale]/privacy/page.tsx` — localized privacy policy.
- `apps/web/app/[locale]/terms-and-conditions/page.tsx` — localized terms page.
- `apps/web/app/[locale]/refund/page.tsx` — localized refund policy.

Modify:

- `apps/web/package.json` — add `test` script and `vitest` devDependency.
- `pnpm-lock.yaml` — update via pnpm when adding `vitest`.
- `apps/web/app/page.tsx` — replace current English home page with root language redirect/fallback page.
- `apps/web/app/components.tsx` — make shell and policy components locale-aware; add language switcher.
- `apps/web/app/layout.tsx` — keep root layout minimal and remove hard-coded English-only metadata assumptions where locale pages now own metadata.
- `apps/web/app/globals.css` — add language selector and root fallback styles; keep existing visual system.

Delete after migration:

- `apps/web/app/price/page.tsx`
- `apps/web/app/price/UpgradeButton.tsx`
- `apps/web/app/log-in/page.tsx`
- `apps/web/app/upgrade/success/page.tsx`
- `apps/web/app/privacy/page.tsx`
- `apps/web/app/terms-and-conditions/page.tsx`
- `apps/web/app/refund/page.tsx`

Do not modify:

- `apps/api/**`
- `apps/extension/**`
- `packages/**`

## Task 1: Add Web Test Harness And I18n Helpers

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/lib/i18n/locales.ts`
- Create: `apps/web/lib/i18n/routing.ts`
- Create: `apps/web/lib/i18n/__tests__/locales.test.ts`
- Create: `apps/web/lib/i18n/__tests__/routing.test.ts`

- [ ] **Step 1: Add Vitest to the web workspace**

Run:

```bash
pnpm --filter @getu/web add -D vitest
```

Expected:

- `apps/web/package.json` gains a `devDependencies.vitest` entry.
- `pnpm-lock.yaml` updates.
- No source files change yet.

- [ ] **Step 2: Add the web test script**

Edit `apps/web/package.json` scripts so the block is:

```json
{
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "echo 'web lint-todo (migrate off deprecated next lint to direct eslint)'",
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Write failing locale tests**

Create `apps/web/lib/i18n/__tests__/locales.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { detectLocaleFromLanguages, getRootRedirectLocale, isSupportedLocale } from "../locales"

describe("web i18n locales", () => {
  it("accepts only supported website locales", () => {
    expect(isSupportedLocale("en")).toBe(true)
    expect(isSupportedLocale("zh-CN")).toBe(true)
    expect(isSupportedLocale("zh-TW")).toBe(true)
    expect(isSupportedLocale("fr")).toBe(false)
    expect(isSupportedLocale(undefined)).toBe(false)
  })

  it("maps simplified Chinese browser languages to zh-CN", () => {
    expect(detectLocaleFromLanguages(["zh-CN"])).toBe("zh-CN")
    expect(detectLocaleFromLanguages(["zh-SG"])).toBe("zh-CN")
    expect(detectLocaleFromLanguages(["zh-Hans-US"])).toBe("zh-CN")
    expect(detectLocaleFromLanguages(["zh"])).toBe("zh-CN")
  })

  it("maps traditional Chinese browser languages to zh-TW", () => {
    expect(detectLocaleFromLanguages(["zh-TW"])).toBe("zh-TW")
    expect(detectLocaleFromLanguages(["zh-HK"])).toBe("zh-TW")
    expect(detectLocaleFromLanguages(["zh-MO"])).toBe("zh-TW")
    expect(detectLocaleFromLanguages(["zh-Hant-HK"])).toBe("zh-TW")
  })

  it("falls back to English after scanning unsupported languages", () => {
    expect(detectLocaleFromLanguages(["fr-CA", "en-US"])).toBe("en")
    expect(detectLocaleFromLanguages(["ja-JP", "ko-KR"])).toBe("en")
    expect(detectLocaleFromLanguages([])).toBe("en")
  })

  it("prefers stored locale over browser language on root redirects", () => {
    expect(getRootRedirectLocale("zh-TW", ["en-US"])).toBe("zh-TW")
    expect(getRootRedirectLocale("fr", ["zh-CN"])).toBe("zh-CN")
    expect(getRootRedirectLocale(null, ["zh-HK"])).toBe("zh-TW")
  })
})
```

- [ ] **Step 4: Write failing routing tests**

Create `apps/web/lib/i18n/__tests__/routing.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { localeHref, switchLocalePath } from "../routing"

describe("web i18n routing", () => {
  it("builds locale-prefixed hrefs with trailing slash friendly paths", () => {
    expect(localeHref("en", "/")).toBe("/en/")
    expect(localeHref("zh-CN", "/price")).toBe("/zh-CN/price/")
    expect(localeHref("zh-TW", "privacy")).toBe("/zh-TW/privacy/")
  })

  it("switches locale while preserving known pages", () => {
    expect(switchLocalePath("/en/price/", "zh-CN")).toBe("/zh-CN/price/")
    expect(switchLocalePath("/zh-CN/log-in/", "en")).toBe("/en/log-in/")
    expect(switchLocalePath("/zh-TW/upgrade/success/", "zh-CN")).toBe("/zh-CN/upgrade/success/")
  })

  it("maps legacy unprefixed pages to the target locale", () => {
    expect(switchLocalePath("/price/", "zh-TW")).toBe("/zh-TW/price/")
    expect(switchLocalePath("/privacy", "zh-CN")).toBe("/zh-CN/privacy/")
  })

  it("falls back to target locale home for unknown paths", () => {
    expect(switchLocalePath("/en/unknown/", "zh-CN")).toBe("/zh-CN/")
    expect(switchLocalePath("/totally-custom", "en")).toBe("/en/")
  })
})
```

- [ ] **Step 5: Run tests and verify they fail**

Run:

```bash
pnpm --filter @getu/web test -- lib/i18n
```

Expected:

- FAIL because `../locales` and `../routing` do not exist.

- [ ] **Step 6: Implement locale helpers**

Create `apps/web/lib/i18n/locales.ts`:

```ts
export const SUPPORTED_LOCALES = ["en", "zh-CN", "zh-TW"] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"
export const LOCALE_STORAGE_KEY = "getu:web-locale"

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
}

export const LOCALE_HTML_LANG: Record<Locale, string> = {
  en: "en",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
}

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function detectLocaleFromLanguages(languages: readonly string[] | undefined): Locale {
  for (const raw of languages ?? []) {
    const normalized = raw.toLowerCase()
    if (normalized === "zh-tw" || normalized === "zh-hk" || normalized === "zh-mo" || normalized.startsWith("zh-hant")) {
      return "zh-TW"
    }
    if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh-sg" || normalized.startsWith("zh-hans")) {
      return "zh-CN"
    }
    if (normalized.startsWith("en")) {
      return "en"
    }
  }
  return DEFAULT_LOCALE
}

export function getRootRedirectLocale(storedLocale: string | null | undefined, languages: readonly string[] | undefined): Locale {
  if (isSupportedLocale(storedLocale)) {
    return storedLocale
  }
  return detectLocaleFromLanguages(languages)
}
```

- [ ] **Step 7: Implement routing helpers**

Create `apps/web/lib/i18n/routing.ts`:

```ts
import { type Locale, SUPPORTED_LOCALES } from "./locales"

const KNOWN_PAGE_PATHS = new Set([
  "",
  "price",
  "log-in",
  "privacy",
  "terms-and-conditions",
  "refund",
  "upgrade/success",
])

function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, "")
}

function withoutLocale(path: string): string {
  const trimmed = trimSlashes(path)
  const parts = trimmed.split("/").filter(Boolean)
  if (parts.length > 0 && (SUPPORTED_LOCALES as readonly string[]).includes(parts[0])) {
    return parts.slice(1).join("/")
  }
  return trimmed
}

export function localeHref(locale: Locale, path: string): string {
  const inner = trimSlashes(path)
  return inner.length === 0 ? `/${locale}/` : `/${locale}/${inner}/`
}

export function switchLocalePath(currentPath: string, targetLocale: Locale): string {
  const inner = withoutLocale(currentPath)
  if (KNOWN_PAGE_PATHS.has(inner)) {
    return localeHref(targetLocale, inner)
  }
  return localeHref(targetLocale, "/")
}
```

- [ ] **Step 8: Run i18n helper tests**

Run:

```bash
pnpm --filter @getu/web test -- lib/i18n
```

Expected:

- PASS for all tests in `locales.test.ts` and `routing.test.ts`.

- [ ] **Step 9: Run web type-check**

Run:

```bash
pnpm --filter @getu/web type-check
```

Expected:

- PASS.

- [ ] **Step 10: Commit Task 1**

Run:

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/lib/i18n
git commit -m "test(web): add i18n helpers"
```

## Task 2: Add Message Catalog And Locale-Aware Shell

**Files:**

- Create: `apps/web/lib/i18n/messages.ts`
- Modify: `apps/web/app/components.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Create typed messages**

Create `apps/web/lib/i18n/messages.ts`. Keep all currently visible English text, add Chinese translations, and include metadata. Use this shape exactly so pages can depend on stable keys:

```ts
import type { Locale } from "./locales"

export type PolicySectionMessage = {
  title: string
  paragraphs?: string[]
  list?: string[]
}

export type Messages = {
  meta: { siteTitle: string; siteDescription: string }
  common: {
    brand: string
    nav: { pricing: string; terms: string; privacy: string; refunds: string; logIn: string }
    footerDescription: string
    languageLabel: string
  }
  legal: { eyebrow: string; effectiveDate: string; translationDisclaimer: string }
  errors: { checkoutFailed: string; signUpFailed: string; signInFailed: string; unexpected: string }
  home: {
    eyebrow: string
    title: string
    intro: string
    viewPricing: string
    readPrivacy: string
    includesTitle: string
    includes: string[]
    highlights: { title: string; body: string }[]
  }
  price: {
    eyebrow: string
    title: string
    intro: string
    plansLabel: string
    freeTitle: string
    freePrice: string
    freeNote: string
    freeFeatures: string[]
    proTitle: string
    monthlyPrice: string
    yearlyPrice: string
    proNote: string
    proFeatures: string[]
    monthly: string
    yearly: string
    subscribe: string
    payOnceMonthly: string
    payOnceYearly: string
    paymentNote: string
    comingSoon: string
    loading: string
    billingTitle: string
    billingBody: string
    billingAgreementPrefix: string
  }
  auth: Record<string, string>
  upgradeSuccess: Record<string, string>
  privacy: { title: string; description: string; sections: PolicySectionMessage[] }
  terms: { title: string; description: string; sections: PolicySectionMessage[] }
  refund: { title: string; description: string; sections: PolicySectionMessage[] }
}

const EMPTY_POLICY_SECTIONS: PolicySectionMessage[] = []

export const messages: Record<Locale, Messages> = {
  en: {
    meta: {
      siteTitle: "GetU Translate",
      siteDescription: "AI-powered browser translation for language learners and multilingual readers.",
    },
    common: {
      brand: "GetU Translate",
      nav: {
        pricing: "Pricing",
        terms: "Terms",
        privacy: "Privacy",
        refunds: "Refunds",
        logIn: "Log in",
      },
      footerDescription: "AI translation tools for web pages, selected text, subtitles, and articles.",
      languageLabel: "Language",
    },
    legal: {
      eyebrow: "Legal",
      effectiveDate: "Effective date: April 22, 2026",
      translationDisclaimer: "",
    },
    errors: {
      checkoutFailed: "Checkout failed",
      signUpFailed: "Sign up failed",
      signInFailed: "Sign in failed",
      unexpected: "Unexpected error",
    },
    home: {
      eyebrow: "Browser translation for serious reading",
      title: "GetU Translate",
      intro: "Understand web pages, selected text, articles, and video subtitles with AI-powered bilingual translation built for language learners.",
      viewPricing: "View pricing",
      readPrivacy: "Read privacy policy",
      includesTitle: "What it includes",
      includes: [
        "Immersive bilingual web page translation",
        "Selection translation and reading assistance",
        "YouTube, Netflix, and web video subtitle translation",
        "Text-to-speech and customizable AI provider settings",
      ],
      highlights: [
        {
          title: "Designed for learners",
          body: "Keep original and translated text side by side so context stays visible while you read.",
        },
        {
          title: "Works where you read",
          body: "Translate pages, selected text, long articles, and video subtitles directly in the browser.",
        },
        {
          title: "Configurable AI",
          body: "Use supported AI providers and prompts that match your reading and study workflow.",
        },
      ],
    },
    price: {
      eyebrow: "Pricing",
      title: "Simple plans for browser translation",
      intro: "Start with the free browser extension, then upgrade when you need higher usage limits and advanced AI translation workflows.",
      plansLabel: "Pricing plans",
      freeTitle: "Free",
      freePrice: "$0",
      freeNote: "For trying GetU Translate and basic language-learning workflows.",
      freeFeatures: [
        "Web page and selected-text translation",
        "Basic bilingual reading tools",
        "Bring-your-own AI provider configuration",
      ],
      proTitle: "GetU Pro",
      monthlyPrice: "$8/mo",
      yearlyPrice: "$72/yr",
      proNote: "per month, or $72 per year when billed annually.",
      proFeatures: [
        "Higher translation usage limits",
        "Advanced article and subtitle translation support",
        "Priority access to new AI reading features",
        "Email support for billing and account issues",
      ],
      monthly: "Monthly",
      yearly: "Yearly",
      subscribe: "Subscribe (auto-renew)",
      payOnceMonthly: "Pay once (30 days)",
      payOnceYearly: "Pay once (1 year)",
      paymentNote: "Subscriptions auto-renew; one-time purchases must be renewed manually after expiry.",
      comingSoon: "Coming soon",
      loading: "Loading...",
      billingTitle: "Billing terms",
      billingBody: "Prices are listed in USD and taxes may apply based on your location. Payments, invoices, renewals, and subscription management are securely handled by Stripe.",
      billingAgreementPrefix: "By purchasing, you agree to our",
    },
    auth: {
      eyebrow: "Account",
      signInTitle: "Sign in",
      signUpTitle: "Create account",
      signInIntro: "Welcome back to GetU Translate.",
      signUpIntro: "Get started with GetU Translate.",
      signInTab: "Sign in",
      signUpTab: "Sign up",
      continueWith: "Continue with",
      google: "Google",
      googleComingSoon: "Google (coming soon)",
      github: "GitHub",
      githubComingSoon: "GitHub (coming soon)",
      or: "or",
      name: "Name",
      namePlaceholder: "Your name",
      email: "Email",
      emailPlaceholder: "you@example.com",
      password: "Password",
      newPasswordPlaceholder: "Choose a password",
      passwordPlaceholder: "Your password",
      submitLoading: "...",
    },
    upgradeSuccess: {
      eyebrow: "Upgrade",
      title: "Thank you for upgrading!",
      polling: "Confirming your subscription... this usually takes a few seconds.",
      done: "Your Pro subscription is active. Head back to the extension and enjoy the full GetU Translate experience.",
      timeoutPrefix: "We could not confirm your subscription yet. It may take a minute to process - please refresh or",
      timeoutLink: "return to pricing",
      timeoutSuffix: "if the issue persists.",
    },
    privacy: {
      title: "Privacy Policy",
      description: "This policy explains what information GetU Translate collects, how we use it, and the choices available to users.",
      sections: EMPTY_POLICY_SECTIONS,
    },
    terms: {
      title: "Terms of Service",
      description: "These terms govern your access to and use of GetU Translate, including our browser extension, website, accounts, and paid subscription features.",
      sections: EMPTY_POLICY_SECTIONS,
    },
    refund: {
      title: "Refund Policy",
      description: "This policy describes how refunds work for GetU Translate paid subscriptions and purchases.",
      sections: EMPTY_POLICY_SECTIONS,
    },
  },
  "zh-CN": {
    meta: {
      siteTitle: "GetU Translate",
      siteDescription: "面向语言学习者和多语言阅读者的 AI 浏览器翻译工具。",
    },
    common: {
      brand: "GetU Translate",
      nav: {
        pricing: "价格",
        terms: "条款",
        privacy: "隐私",
        refunds: "退款",
        logIn: "登录",
      },
      footerDescription: "面向网页、划词、字幕和文章阅读的 AI 翻译工具。",
      languageLabel: "语言",
    },
    legal: {
      eyebrow: "法律",
      effectiveDate: "生效日期：2026 年 4 月 22 日",
      translationDisclaimer: "本译文仅为方便阅读；如与英文版本不一致，以英文版本为准。",
    },
    errors: {
      checkoutFailed: "无法打开结账页面",
      signUpFailed: "注册失败",
      signInFailed: "登录失败",
      unexpected: "发生未知错误",
    },
    home: {
      eyebrow: "为深度阅读而生的浏览器翻译",
      title: "GetU Translate",
      intro: "用 AI 双语翻译理解网页、划词、文章和视频字幕，为语言学习者打造沉浸式阅读体验。",
      viewPricing: "查看价格",
      readPrivacy: "阅读隐私政策",
      includesTitle: "功能包括",
      includes: [
        "沉浸式双语网页翻译",
        "划词翻译和阅读辅助",
        "YouTube、Netflix 和网页视频字幕翻译",
        "文本转语音和可自定义的 AI Provider 设置",
      ],
      highlights: [
        {
          title: "为学习者设计",
          body: "原文与译文并排呈现，让你阅读时始终保留上下文。",
        },
        {
          title: "覆盖你的阅读场景",
          body: "直接在浏览器中翻译网页、划词、长文章和视频字幕。",
        },
        {
          title: "可配置的 AI",
          body: "使用支持的 AI Provider 和适合你阅读、学习流程的提示词。",
        },
      ],
    },
    price: {
      eyebrow: "价格",
      title: "简单清晰的浏览器翻译套餐",
      intro: "先从免费浏览器扩展开始；当你需要更高用量和高级 AI 翻译工作流时，再升级到 Pro。",
      plansLabel: "价格套餐",
      freeTitle: "免费版",
      freePrice: "$0",
      freeNote: "适合试用 GetU Translate 和基础语言学习流程。",
      freeFeatures: [
        "网页和划词翻译",
        "基础双语阅读工具",
        "自带 AI Provider 配置",
      ],
      proTitle: "GetU Pro",
      monthlyPrice: "$8/月",
      yearlyPrice: "$72/年",
      proNote: "按月支付，或按年支付 $72。",
      proFeatures: [
        "更高翻译用量",
        "高级文章和字幕翻译支持",
        "优先体验新的 AI 阅读功能",
        "账单和账户问题邮件支持",
      ],
      monthly: "月付",
      yearly: "年付",
      subscribe: "订阅（自动续费）",
      payOnceMonthly: "单次购买（30 天）",
      payOnceYearly: "单次购买（1 年）",
      paymentNote: "订阅自动续费；一次性付款到期需重新购买。",
      comingSoon: "即将推出",
      loading: "加载中...",
      billingTitle: "账单条款",
      billingBody: "价格以美元列出，可能会根据你的所在地收取税费。付款、发票、续费和订阅管理由 Stripe 安全处理。",
      billingAgreementPrefix: "购买即表示你同意我们的",
    },
    auth: {
      eyebrow: "账户",
      signInTitle: "登录",
      signUpTitle: "创建账户",
      signInIntro: "欢迎回到 GetU Translate。",
      signUpIntro: "开始使用 GetU Translate。",
      signInTab: "登录",
      signUpTab: "注册",
      continueWith: "继续使用",
      google: "Google",
      googleComingSoon: "Google（即将推出）",
      github: "GitHub",
      githubComingSoon: "GitHub（即将推出）",
      or: "或",
      name: "姓名",
      namePlaceholder: "你的姓名",
      email: "邮箱",
      emailPlaceholder: "you@example.com",
      password: "密码",
      newPasswordPlaceholder: "设置密码",
      passwordPlaceholder: "你的密码",
      submitLoading: "...",
    },
    upgradeSuccess: {
      eyebrow: "升级",
      title: "感谢升级！",
      polling: "正在确认你的订阅，通常只需要几秒钟。",
      done: "你的 Pro 订阅已生效。回到扩展即可使用完整的 GetU Translate 体验。",
      timeoutPrefix: "暂时无法确认你的订阅。处理可能需要一分钟，请刷新页面，或",
      timeoutLink: "返回价格页",
      timeoutSuffix: "继续查看。",
    },
    privacy: {
      title: "隐私政策",
      description: "本政策说明 GetU Translate 收集哪些信息、如何使用这些信息，以及用户可做出的选择。",
      sections: EMPTY_POLICY_SECTIONS,
    },
    terms: {
      title: "服务条款",
      description: "这些条款适用于你访问和使用 GetU Translate，包括浏览器扩展、网站、账户和付费订阅功能。",
      sections: EMPTY_POLICY_SECTIONS,
    },
    refund: {
      title: "退款政策",
      description: "本政策说明 GetU Translate 付费订阅和购买的退款规则。",
      sections: EMPTY_POLICY_SECTIONS,
    },
  },
  "zh-TW": {
    meta: {
      siteTitle: "GetU Translate",
      siteDescription: "面向語言學習者和多語閱讀者的 AI 瀏覽器翻譯工具。",
    },
    common: {
      brand: "GetU Translate",
      nav: {
        pricing: "價格",
        terms: "條款",
        privacy: "隱私",
        refunds: "退款",
        logIn: "登入",
      },
      footerDescription: "面向網頁、劃詞、字幕和文章閱讀的 AI 翻譯工具。",
      languageLabel: "語言",
    },
    legal: {
      eyebrow: "法律",
      effectiveDate: "生效日期：2026 年 4 月 22 日",
      translationDisclaimer: "本譯文僅為方便閱讀；如與英文版本不一致，以英文版本為準。",
    },
    errors: {
      checkoutFailed: "無法開啟結帳頁面",
      signUpFailed: "註冊失敗",
      signInFailed: "登入失敗",
      unexpected: "發生未知錯誤",
    },
    home: {
      eyebrow: "為深度閱讀而生的瀏覽器翻譯",
      title: "GetU Translate",
      intro: "用 AI 雙語翻譯理解網頁、劃詞、文章和影片字幕，為語言學習者打造沉浸式閱讀體驗。",
      viewPricing: "查看價格",
      readPrivacy: "閱讀隱私政策",
      includesTitle: "功能包括",
      includes: [
        "沉浸式雙語網頁翻譯",
        "劃詞翻譯和閱讀輔助",
        "YouTube、Netflix 和網頁影片字幕翻譯",
        "文字轉語音和可自訂的 AI Provider 設定",
      ],
      highlights: [
        {
          title: "為學習者設計",
          body: "原文與譯文並排呈現，讓你閱讀時始終保留上下文。",
        },
        {
          title: "覆蓋你的閱讀場景",
          body: "直接在瀏覽器中翻譯網頁、劃詞、長文章和影片字幕。",
        },
        {
          title: "可設定的 AI",
          body: "使用支援的 AI Provider 和適合你閱讀、學習流程的提示詞。",
        },
      ],
    },
    price: {
      eyebrow: "價格",
      title: "簡單清晰的瀏覽器翻譯方案",
      intro: "先從免費瀏覽器擴充功能開始；當你需要更高用量和進階 AI 翻譯工作流時，再升級到 Pro。",
      plansLabel: "價格方案",
      freeTitle: "免費版",
      freePrice: "$0",
      freeNote: "適合試用 GetU Translate 和基礎語言學習流程。",
      freeFeatures: [
        "網頁和劃詞翻譯",
        "基礎雙語閱讀工具",
        "自帶 AI Provider 設定",
      ],
      proTitle: "GetU Pro",
      monthlyPrice: "$8/月",
      yearlyPrice: "$72/年",
      proNote: "按月支付，或按年支付 $72。",
      proFeatures: [
        "更高翻譯用量",
        "進階文章和字幕翻譯支援",
        "優先體驗新的 AI 閱讀功能",
        "帳單和帳戶問題郵件支援",
      ],
      monthly: "月付",
      yearly: "年付",
      subscribe: "訂閱（自動續費）",
      payOnceMonthly: "單次購買（30 天）",
      payOnceYearly: "單次購買（1 年）",
      paymentNote: "訂閱自動續費；一次性付款到期需重新購買。",
      comingSoon: "即將推出",
      loading: "載入中...",
      billingTitle: "帳單條款",
      billingBody: "價格以美元列出，可能會依你的所在地收取稅費。付款、發票、續費和訂閱管理由 Stripe 安全處理。",
      billingAgreementPrefix: "購買即表示你同意我們的",
    },
    auth: {
      eyebrow: "帳戶",
      signInTitle: "登入",
      signUpTitle: "建立帳戶",
      signInIntro: "歡迎回到 GetU Translate。",
      signUpIntro: "開始使用 GetU Translate。",
      signInTab: "登入",
      signUpTab: "註冊",
      continueWith: "繼續使用",
      google: "Google",
      googleComingSoon: "Google（即將推出）",
      github: "GitHub",
      githubComingSoon: "GitHub（即將推出）",
      or: "或",
      name: "姓名",
      namePlaceholder: "你的姓名",
      email: "電子郵件",
      emailPlaceholder: "you@example.com",
      password: "密碼",
      newPasswordPlaceholder: "設定密碼",
      passwordPlaceholder: "你的密碼",
      submitLoading: "...",
    },
    upgradeSuccess: {
      eyebrow: "升級",
      title: "感謝升級！",
      polling: "正在確認你的訂閱，通常只需要幾秒鐘。",
      done: "你的 Pro 訂閱已生效。回到擴充功能即可使用完整的 GetU Translate 體驗。",
      timeoutPrefix: "暫時無法確認你的訂閱。處理可能需要一分鐘，請重新整理頁面，或",
      timeoutLink: "返回價格頁",
      timeoutSuffix: "繼續查看。",
    },
    privacy: {
      title: "隱私政策",
      description: "本政策說明 GetU Translate 收集哪些資訊、如何使用這些資訊，以及使用者可做出的選擇。",
      sections: EMPTY_POLICY_SECTIONS,
    },
    terms: {
      title: "服務條款",
      description: "這些條款適用於你存取和使用 GetU Translate，包括瀏覽器擴充功能、網站、帳戶和付費訂閱功能。",
      sections: EMPTY_POLICY_SECTIONS,
    },
    refund: {
      title: "退款政策",
      description: "本政策說明 GetU Translate 付費訂閱和購買的退款規則。",
      sections: EMPTY_POLICY_SECTIONS,
    },
  },
}

export function getMessages(locale: Locale): Messages {
  return messages[locale]
}
```

Important: this step intentionally leaves policy `sections` empty so the shell can be migrated first. Task 4 fills them before the feature is complete.

- [ ] **Step 2: Refactor shared components**

Modify `apps/web/app/components.tsx`:

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LOCALE_LABELS, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales"
import { localeHref, switchLocalePath } from "@/lib/i18n/routing"
import type { Messages, PolicySectionMessage } from "@/lib/i18n/messages"

export function SiteShell({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode
  locale: Locale
  messages: Messages["common"]
}) {
  const footerLinks = [
    { href: localeHref(locale, "/price"), label: messages.nav.pricing },
    { href: localeHref(locale, "/terms-and-conditions"), label: messages.nav.terms },
    { href: localeHref(locale, "/privacy"), label: messages.nav.privacy },
    { href: localeHref(locale, "/refund"), label: messages.nav.refunds },
  ]
  const topNavLinks = [
    ...footerLinks,
    { href: localeHref(locale, "/log-in"), label: messages.nav.logIn },
  ]

  return (
    <main className="site-shell">
      <header className="site-header" aria-label="Main navigation">
        <Link className="brand" href={localeHref(locale, "/")}>
          <span className="brand-mark" aria-hidden="true">G</span>
          <span>{messages.brand}</span>
        </Link>
        <nav className="top-nav">
          {topNavLinks.map(link => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
          <LanguageSwitcher locale={locale} label={messages.languageLabel} />
        </nav>
      </header>

      {children}

      <footer className="site-footer">
        <div>
          <strong>{messages.brand}</strong>
          <p>{messages.footerDescription}</p>
        </div>
        <nav aria-label="Legal links">
          {footerLinks.map(link => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
        </nav>
      </footer>
    </main>
  )
}

function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname()

  function onChange(nextLocale: Locale) {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
    } catch {
      // Browsers may block storage; URL switch still works.
    }
    window.location.href = switchLocalePath(pathname ?? "/", nextLocale)
  }

  return (
    <label className="language-switcher">
      <span className="sr-only">{label}</span>
      <select
        value={locale}
        aria-label={label}
        onChange={event => onChange(event.target.value as Locale)}
      >
        {SUPPORTED_LOCALES.map(option => (
          <option key={option} value={option}>{LOCALE_LABELS[option]}</option>
        ))}
      </select>
    </label>
  )
}

export function PageHero({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="page-hero">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <div className="hero-copy">{children}</div>
    </section>
  )
}

export function PolicyPage({
  locale,
  common,
  legal,
  title,
  description,
  sections,
}: {
  locale: Locale
  common: Messages["common"]
  legal: Messages["legal"]
  title: string
  description: string
  sections: PolicySectionMessage[]
}) {
  return (
    <SiteShell locale={locale} messages={common}>
      <PageHero eyebrow={legal.eyebrow} title={title}>
        <p>{description}</p>
        <p className="muted">{legal.effectiveDate}</p>
        {legal.translationDisclaimer && <p className="muted">{legal.translationDisclaimer}</p>}
      </PageHero>
      <article className="policy-body">
        {sections.map(section => (
          <PolicySection key={section.title} title={section.title}>
            {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {section.list && (
              <ul>
                {section.list.map(item => <li key={item}>{item}</li>)}
              </ul>
            )}
          </PolicySection>
        ))}
      </article>
    </SiteShell>
  )
}

export function PolicySection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  )
}
```

- [ ] **Step 3: Add CSS for language switcher and screen-reader label**

Append to `apps/web/app/globals.css` before the media query:

```css
.language-switcher {
  display: inline-flex;
}

.language-switcher select {
  background: rgb(255 253 248 / 72%);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink-soft);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  min-height: 34px;
  padding: 5px 28px 5px 10px;
}

.language-switcher select:focus {
  border-color: var(--accent);
  outline: none;
}

.sr-only {
  border: 0;
  clip: rect(0 0 0 0);
  height: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}
```

- [ ] **Step 4: Run validation**

Run:

```bash
pnpm --filter @getu/web type-check
pnpm --filter @getu/web test -- lib/i18n
```

Expected:

- PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add apps/web/lib/i18n/messages.ts apps/web/app/components.tsx apps/web/app/globals.css
git commit -m "feat(web): add localized site shell"
```

## Task 3: Migrate Public Routes To Locale Prefixes

**Files:**

- Create: `apps/web/app/[locale]/layout.tsx`
- Create: `apps/web/app/[locale]/page.tsx`
- Create: `apps/web/app/[locale]/price/page.tsx`
- Create: `apps/web/app/[locale]/price/UpgradeButton.tsx`
- Create: `apps/web/app/[locale]/log-in/page.tsx`
- Create: `apps/web/app/[locale]/upgrade/success/page.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/layout.tsx`
- Delete: old unprefixed page files after copied.

- [ ] **Step 1: Add locale layout**

Create `apps/web/app/[locale]/layout.tsx`:

```tsx
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, LOCALE_HTML_LANG, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales"

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map(locale => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isSupportedLocale(rawLocale)) {
    return {}
  }
  const t = getMessages(rawLocale)
  return {
    title: t.meta.siteTitle,
    description: t.meta.siteDescription,
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale: rawLocale } = await params
  if (!isSupportedLocale(rawLocale)) {
    notFound()
  }
  const locale: Locale = rawLocale
  return <div lang={LOCALE_HTML_LANG[locale]}>{children}</div>
}
```

- [ ] **Step 2: Keep root layout global only**

Modify `apps/web/app/layout.tsx` to keep app-wide HTML and default metadata:

```tsx
import "./globals.css"

export const metadata = {
  title: "GetU Translate",
  description: "AI-powered browser translation for language learners and multilingual readers.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

Note: `html lang` remains default `en` because Next only allows `<html>` in the root layout. The locale layout adds a scoped `lang` attribute, and Task 5 verifies metadata and hreflang output.

- [ ] **Step 3: Replace root home with redirect/fallback page**

Replace `apps/web/app/page.tsx`:

```tsx
"use client"

import Link from "next/link"
import { useEffect } from "react"
import { getRootRedirectLocale, LOCALE_LABELS, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from "@/lib/i18n/locales"
import { localeHref } from "@/lib/i18n/routing"

export default function RootLocaleRedirectPage() {
  useEffect(() => {
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    } catch {
      stored = null
    }
    const locale = getRootRedirectLocale(stored, window.navigator.languages)
    window.location.replace(localeHref(locale, "/"))
  }, [])

  return (
    <main className="root-locale-page">
      <h1>GetU Translate</h1>
      <nav aria-label="Choose language">
        {SUPPORTED_LOCALES.map(locale => (
          <Link key={locale} className="button secondary" href={localeHref(locale, "/")}>
            {LOCALE_LABELS[locale]}
          </Link>
        ))}
      </nav>
    </main>
  )
}
```

- [ ] **Step 4: Add root fallback CSS**

Add to `apps/web/app/globals.css` before the media query:

```css
.root-locale-page {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 20px;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  text-align: center;
}

.root-locale-page h1 {
  font-family: Georgia, ui-serif, serif;
  font-size: 48px;
  font-weight: 520;
  letter-spacing: 0;
  line-height: 1;
  margin: 0;
}

.root-locale-page nav {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}
```

- [ ] **Step 5: Create localized home page**

Create `apps/web/app/[locale]/page.tsx` by moving the existing home markup and replacing strings:

```tsx
import Link from "next/link"
import { SiteShell } from "@/app/components"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"
import { localeHref } from "@/lib/i18n/routing"

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)

  return (
    <SiteShell locale={locale} messages={t.common}>
      <section className="home-hero">
        <div>
          <p className="eyebrow">{t.home.eyebrow}</p>
          <h1>{t.home.title}</h1>
          <p>{t.home.intro}</p>
          <div className="cta-row">
            <Link className="button primary" href={localeHref(locale, "/price")}>{t.home.viewPricing}</Link>
            <Link className="button secondary" href={localeHref(locale, "/privacy")}>{t.home.readPrivacy}</Link>
          </div>
        </div>
        <aside className="product-panel" aria-label={t.home.includesTitle}>
          <h2>{t.home.includesTitle}</h2>
          <ul className="signal-list">
            {t.home.includes.map(item => <li key={item}>{item}</li>)}
          </ul>
        </aside>
      </section>

      <section className="feature-band" aria-label="Product highlights">
        {t.home.highlights.map(item => (
          <div key={item.title}>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </div>
        ))}
      </section>
    </SiteShell>
  )
}
```

- [ ] **Step 6: Create localized price page and button**

Copy the current `apps/web/app/price/page.tsx` and `UpgradeButton.tsx` to `apps/web/app/[locale]/price/`, then replace all UI text with `t.price` and pass `locale`, `priceMessages`, and `errors` to `UpgradeButton`.

In `apps/web/app/[locale]/price/UpgradeButton.tsx`, keep the existing API call and change URLs:

```tsx
successUrl: `${SITE_ORIGIN}/${locale}/upgrade/success/`,
cancelUrl: `${SITE_ORIGIN}/${locale}/price/`,
```

Also replace:

```tsx
setError(err instanceof Error ? err.message : "Checkout failed")
return <button className="button primary" disabled>Coming soon</button>
{loading ? "Loading\u2026" : label}
```

with:

```tsx
setError(err instanceof Error ? err.message : errors.checkoutFailed)
return <button className="button primary" disabled>{priceMessages.comingSoon}</button>
{loading ? priceMessages.loading : label}
```

- [ ] **Step 7: Create localized login page**

Copy `apps/web/app/log-in/page.tsx` to `apps/web/app/[locale]/log-in/page.tsx`, read locale/messages from params, and replace UI strings with `t.auth` and default error strings with `t.errors`.

Change social callback from:

```ts
callbackURL: `${window.location.origin}/`,
```

to:

```ts
callbackURL: `${window.location.origin}/${locale}/`,
```

- [ ] **Step 8: Create localized upgrade success page**

Copy `apps/web/app/upgrade/success/page.tsx` to `apps/web/app/[locale]/upgrade/success/page.tsx`, use `t.upgradeSuccess`, and make the timeout link:

```tsx
<a href={localeHref(locale, "/price")}>{t.upgradeSuccess.timeoutLink}</a>
```

- [ ] **Step 9: Delete migrated unprefixed pages**

Delete:

```bash
rm -f apps/web/app/price/page.tsx
rm -f apps/web/app/price/UpgradeButton.tsx
rm -f apps/web/app/log-in/page.tsx
rm -f apps/web/app/upgrade/success/page.tsx
```

Then remove empty directories if present:

```bash
rmdir apps/web/app/price apps/web/app/log-in apps/web/app/upgrade/success apps/web/app/upgrade 2>/dev/null || true
```

- [ ] **Step 10: Run validation**

Run:

```bash
pnpm --filter @getu/web type-check
pnpm --filter @getu/web build
```

Expected:

- PASS.
- `apps/web/out/en/index.html`, `apps/web/out/zh-CN/index.html`, and `apps/web/out/zh-TW/index.html` exist.

- [ ] **Step 11: Commit Task 3**

Run:

```bash
git add apps/web/app apps/web/lib/i18n/messages.ts
git commit -m "feat(web): add locale-prefixed routes"
```

## Task 4: Localize Legal Pages

**Files:**

- Modify: `apps/web/lib/i18n/messages.ts`
- Create: `apps/web/app/[locale]/privacy/page.tsx`
- Create: `apps/web/app/[locale]/terms-and-conditions/page.tsx`
- Create: `apps/web/app/[locale]/refund/page.tsx`
- Delete: old unprefixed legal pages.

- [ ] **Step 1: Fill policy message sections**

In `apps/web/lib/i18n/messages.ts`, replace each `sections: EMPTY_POLICY_SECTIONS` with translated section arrays. Preserve the English legal meaning from current pages. Use `PolicySectionMessage` objects:

```ts
sections: [
  {
    title: "1. Information we collect",
    paragraphs: ["Depending on how you use GetU Translate, we may collect:"],
    list: [
      "Account information such as email address and login details.",
      "Subscription and billing status received from Stripe.",
      "Product settings, language preferences, and configuration choices.",
      "Technical data such as browser type, extension version, diagnostics, and error logs.",
      "Content you choose to translate when a feature requires processing by an AI or translation provider.",
    ],
  },
]
```

Important: update the old Paddle references to Stripe because the current price page says Stripe handles payments. Use the same provider wording in English, Simplified Chinese, and Traditional Chinese.

- [ ] **Step 2: Create localized privacy page**

Create `apps/web/app/[locale]/privacy/page.tsx`:

```tsx
import type { Metadata } from "next"
import { PolicyPage } from "@/app/components"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)
  return {
    title: `${t.privacy.title} | GetU Translate`,
    description: t.privacy.description,
  }
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)
  return (
    <PolicyPage
      locale={locale}
      common={t.common}
      legal={t.legal}
      title={t.privacy.title}
      description={t.privacy.description}
      sections={t.privacy.sections}
    />
  )
}
```

- [ ] **Step 3: Create localized terms page**

Create `apps/web/app/[locale]/terms-and-conditions/page.tsx`:

```tsx
import type { Metadata } from "next"
import { PolicyPage } from "@/app/components"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)
  return {
    title: `${t.terms.title} | GetU Translate`,
    description: t.terms.description,
  }
}

export default async function TermsAndConditionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)
  return (
    <PolicyPage
      locale={locale}
      common={t.common}
      legal={t.legal}
      title={t.terms.title}
      description={t.terms.description}
      sections={t.terms.sections}
    />
  )
}
```

- [ ] **Step 4: Create localized refund page**

Create `apps/web/app/[locale]/refund/page.tsx`:

```tsx
import type { Metadata } from "next"
import { PolicyPage } from "@/app/components"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)
  return {
    title: `${t.refund.title} | GetU Translate`,
    description: t.refund.description,
  }
}

export default async function RefundPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)
  return (
    <PolicyPage
      locale={locale}
      common={t.common}
      legal={t.legal}
      title={t.refund.title}
      description={t.refund.description}
      sections={t.refund.sections}
    />
  )
}
```

- [ ] **Step 5: Delete old legal pages**

Run:

```bash
rm -f apps/web/app/privacy/page.tsx
rm -f apps/web/app/terms-and-conditions/page.tsx
rm -f apps/web/app/refund/page.tsx
rmdir apps/web/app/privacy apps/web/app/terms-and-conditions apps/web/app/refund 2>/dev/null || true
```

- [ ] **Step 6: Run validation**

Run:

```bash
pnpm --filter @getu/web type-check
pnpm --filter @getu/web build
```

Expected:

- PASS.
- `apps/web/out/en/privacy/index.html`, `apps/web/out/zh-CN/privacy/index.html`, and `apps/web/out/zh-TW/privacy/index.html` exist.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add apps/web/app apps/web/lib/i18n/messages.ts
git commit -m "feat(web): localize legal pages"
```

## Task 5: Add Hreflang Metadata And Final Static Verification

**Files:**

- Modify: `apps/web/lib/i18n/routing.ts`
- Modify: `apps/web/app/[locale]/layout.tsx`
- Modify: `apps/web/app/[locale]/price/page.tsx`
- Modify: `apps/web/app/[locale]/privacy/page.tsx`
- Modify: `apps/web/app/[locale]/terms-and-conditions/page.tsx`
- Modify: `apps/web/app/[locale]/refund/page.tsx`

- [ ] **Step 1: Add absolute URL helpers**

Add to `apps/web/lib/i18n/routing.ts`:

```ts
export const SITE_ORIGIN = "https://getutranslate.com"

export function absoluteLocaleUrl(locale: Locale, path: string): string {
  return `${SITE_ORIGIN}${localeHref(locale, path)}`
}

export function languageAlternates(path: string): Record<string, string> {
  return {
    en: absoluteLocaleUrl("en", path),
    "zh-CN": absoluteLocaleUrl("zh-CN", path),
    "zh-TW": absoluteLocaleUrl("zh-TW", path),
  }
}
```

- [ ] **Step 2: Add layout-level alternates for home**

Update `apps/web/app/[locale]/layout.tsx` metadata to include:

```ts
alternates: {
  canonical: absoluteLocaleUrl(rawLocale, "/"),
  languages: languageAlternates("/"),
},
```

Import `absoluteLocaleUrl` and `languageAlternates` from `@/lib/i18n/routing`.

- [ ] **Step 3: Add page-specific alternates**

For localized pages with page metadata, ensure `generateMetadata` returns the matching canonical and alternates:

```ts
alternates: {
  canonical: absoluteLocaleUrl(locale, "/privacy"),
  languages: languageAlternates("/privacy"),
},
```

Use these exact paths:

| File | Path |
|------|------|
| `apps/web/app/[locale]/price/page.tsx` | `/price` |
| `apps/web/app/[locale]/privacy/page.tsx` | `/privacy` |
| `apps/web/app/[locale]/terms-and-conditions/page.tsx` | `/terms-and-conditions` |
| `apps/web/app/[locale]/refund/page.tsx` | `/refund` |

The final expected state is that generated HTML for `/en/privacy/`, `/zh-CN/privacy/`, and `/zh-TW/privacy/` contains alternate links pointing to all three language versions of the privacy page, not home.

- [ ] **Step 4: Run helper tests and build**

Run:

```bash
pnpm --filter @getu/web test -- lib/i18n
pnpm --filter @getu/web type-check
pnpm --filter @getu/web build
```

Expected:

- PASS.

- [ ] **Step 5: Inspect static output**

Run:

```bash
test -f apps/web/out/index.html
test -f apps/web/out/en/index.html
test -f apps/web/out/zh-CN/index.html
test -f apps/web/out/zh-TW/index.html
test -f apps/web/out/en/price/index.html
test -f apps/web/out/zh-CN/price/index.html
test -f apps/web/out/zh-TW/price/index.html
test -f apps/web/out/en/privacy/index.html
test -f apps/web/out/zh-CN/privacy/index.html
test -f apps/web/out/zh-TW/privacy/index.html
rg -n "简体中文|繁體中文|English" apps/web/out/index.html
rg -n "查看价格|查看價格|View pricing" apps/web/out/zh-CN/index.html apps/web/out/zh-TW/index.html apps/web/out/en/index.html
rg -n "hreflang" apps/web/out/en/privacy/index.html apps/web/out/zh-CN/privacy/index.html apps/web/out/zh-TW/privacy/index.html
```

Expected:

- All `test -f` commands pass with no output.
- `rg` finds fallback language links in `/`.
- `rg` finds localized home CTA strings.
- `rg` finds hreflang links on legal pages.

- [ ] **Step 6: Check git diff for deleted legacy routes**

Run:

```bash
git status --short
```

Expected:

- Deleted old unprefixed route files are intentional.
- No changes under `apps/api`, `apps/extension`, or `packages`.

- [ ] **Step 7: Commit Task 5**

Run:

```bash
git add apps/web
git commit -m "feat(web): add localized metadata"
```

## Final Acceptance

- [ ] `/` auto-selects locale using stored choice first, then browser languages, then English.
- [ ] `/` fallback contains links to English, Simplified Chinese, and Traditional Chinese.
- [ ] `/en/`, `/zh-CN/`, `/zh-TW/` home pages build as static HTML.
- [ ] All existing pages exist under each locale prefix.
- [ ] Top navigation language selector switches to the same page in the target locale and stores the choice.
- [ ] Pricing checkout success/cancel URLs preserve current locale.
- [ ] Social login callback preserves current locale.
- [ ] Legal pages have full localized content and Chinese versions include the English-version-priority notice.
- [ ] Metadata title/description are localized where page-specific metadata exists.
- [ ] Hreflang alternates point to matching pages across `en`, `zh-CN`, and `zh-TW`.
- [ ] `pnpm --filter @getu/web test -- lib/i18n` passes.
- [ ] `pnpm --filter @getu/web type-check` passes.
- [ ] `pnpm --filter @getu/web build` passes.

## Self-Review Notes

- Spec coverage: URL prefixes, localStorage language memory, browser language detection, full current-page coverage, legal disclaimer, top-nav selector, static export, checkout/auth return paths, SEO, tests, and non-goals are all mapped to tasks.
- Scope: Single subsystem, `apps/web` only. No API, extension, account preference, CMS, or currency changes.
- Risk: Task 5 verifies actual Next static output for `hreflang`. If Next metadata does not emit the desired links under `output: "export"`, the implementer should add a small locale metadata helper that returns Next-compatible `alternates` objects and use it from every localized `generateMetadata` before committing Task 5.
