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
