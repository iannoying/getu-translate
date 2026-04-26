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
    cnyMonthlyPrice: string
    cnyYearlyPrice: string
    proNote: string
    proFeatures: string[]
    monthly: string
    yearly: string
    subscribe: string
    buyOnce: string
    billingNoteUsd: string
    billingNoteCny: string
    comingSoon: string
    loginToSubscribe: string
    loading: string
    billingTitle: string
    billingBody: string
    billingAgreementPrefix: string
  }
  auth: Record<string, string>
  settings: Record<string, string>
  upgradeSuccess: Record<string, string>
  privacy: { title: string; description: string; sections: PolicySectionMessage[] }
  terms: { title: string; description: string; sections: PolicySectionMessage[] }
  refund: { title: string; description: string; sections: PolicySectionMessage[] }
  guide: {
    eyebrow: string
    stepLabel: string
    step1Title: string
    step1Intro: string
    pinTitle: string
    pinSteps: string[]
    tryTitle: string
    tryBody: string
    openPricing: string
    openHome: string
  }
  translate: {
    metaTitle: string
    metaDescription: string
    shell: { text: string; document: string; upgradePro: string }
    page: {
      inputPlaceholder: string
      translateButton: string
      translateLoginButton: string
      translateLoadingButton: string
      clearButton: string
      /** Template like "{used} / {limit} chars" — page replaces {used}/{limit}. */
      charCounterTemplate: string
      charLimitExceeded: string
      quotaLabel: string
      historyToggle: string
      historyComingSoon: string
      upgradePromptShort: string
      notImplementedToast: string
      cardLoading: string
      cardErrorFallback: string
    }
    history: {
      toggleOpen: string
      toggleClose: string
      searchPlaceholder: string
      clearAllButton: string
      emptyState: string
      loading: string
      groupToday: string
      groupYesterday: string
      groupThisWeek: string
      groupOlder: string
      /** Template `{count}` interpolated. */
      clearConfirmTemplate: string
      deleteEntryAriaLabel: string
    }
    upgradeModal: {
      titles: {
        free_quota_exceeded: string
        pro_model_clicked: string
        pdf_quota_exceeded: string
        char_limit_exceeded: string
        history_cleanup_warning: string
      }
      perks: {
        header: string
        rowRequests: string
        rowModels: string
        rowChars: string
        rowPdf: string
        rowHistory: string
      }
      cta: string
      close: string
    }
    quotaBadge: {
      /** Template: {textUsed} {textLimit} {tokenUsed} {tokenLimit} {pdfUsed} {pdfLimit} */
      tooltip: string
    }
  }
  document: {
    metaTitle: string
    metaDescription: string
    uploadButton: string
    dragDropHint: string
    /** Template `{maxMB}` `{maxPages}`. */
    limitsTemplate: string
    clearFile: string
    modelPicker: string
    modelLockedSuffix: string
    submit: string
    /** Template `{pct}` interpolated. */
    uploadingTemplate: string
    creating: string
    /** Template `{jobId}`. */
    resultPlaceholder: string
    fromUrl: {
      heading: string
      loading: string
    }
    errors: {
      heading: string
      notPdf: string
      fileTooLarge: string
      r2Unavailable: string
      presignFailed: string
      uploadFailed: string
      fromUrlFailed: string
      scannedPdfError: string
    }
  }
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
      monthlyPrice: "$5/mo",
      yearlyPrice: "$50/yr",
      cnyMonthlyPrice: "¥29/月",
      cnyYearlyPrice: "¥299/年",
      proNote: "per month, or $50 per year when billed annually.",
      proFeatures: [
        "Higher translation usage limits",
        "Advanced article and subtitle translation support",
        "Priority access to new AI reading features",
        "Email support for billing and account issues",
      ],
      monthly: "Monthly",
      yearly: "Yearly",
      subscribe: "Subscribe (auto-renew)",
      buyOnce: "立即购买（一次性）",
      billingNoteUsd: "Subscription auto-renews each billing period. Cancel anytime via customer portal.",
      billingNoteCny: "一次性付款，到期后需重新购买。支持信用卡、支付宝、微信支付。",
      comingSoon: "Coming soon",
      loginToSubscribe: "Log in to subscribe",
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
      methodPasswordTab: "Password",
      methodCodeTab: "Email code",
      code: "Verification code",
      codePlaceholder: "6-digit code",
      sendCode: "Send code",
      sendingCode: "Sending...",
      codeSent: "Code sent. Check your inbox.",
      resendCodeIn: "Resend in {seconds}s",
      resendCode: "Resend code",
      sendCodeFailed: "Could not send the code. Please try again.",
      forgotPassword: "Forgot password?",
      passkeyHint: "Tip: after signing in, add a passkey in Settings for one-tap login.",
      submit: "Sign in",
      submitSignUp: "Create account",
    },
    settings: {
      eyebrow: "Account",
      title: "Account settings",
      intro: "Manage how you sign in to GetU Translate.",
      signedInAs: "Signed in as",
      signOut: "Sign out",
      passkeysTitle: "Passkeys",
      passkeysIntro: "Add a passkey so you can sign in with your fingerprint, face, or device PIN — no password or code required.",
      addPasskey: "Add a passkey",
      adding: "Adding...",
      noPasskeys: "No passkeys yet.",
      remove: "Remove",
      removing: "Removing...",
      passkeyAdded: "Passkey added.",
      passkeyAddFailed: "Could not add passkey.",
      passkeyRemoveFailed: "Could not remove passkey.",
      created: "Added",
      unsupported: "This browser does not support passkeys.",
      requireSignIn: "Please sign in to manage your account.",
      goToLogIn: "Go to log in",
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
        {
          title: "2. How we use information",
          paragraphs: ["We use information to provide and improve GetU Translate, including to:"],
          list: [
            "Operate translation, subtitle, article reading, and text-to-speech features.",
            "Manage accounts, subscriptions, support, and security.",
            "Debug product issues and protect against abuse.",
            "Comply with legal, tax, and payment obligations.",
          ],
        },
        {
          title: "3. AI and translation providers",
          paragraphs: [
            "GetU Translate may send text you choose to translate to supported AI or translation providers. If you configure your own provider account or API key, that provider's terms and privacy practices may also apply.",
          ],
        },
        {
          title: "4. Payments",
          paragraphs: [
            "Payments are handled by Stripe. Stripe may process personal and payment information to complete purchases, manage subscriptions, prevent fraud, calculate taxes, and issue invoices. We receive limited billing information such as subscription status and transaction identifiers.",
          ],
        },
        {
          title: "5. Sharing",
          paragraphs: [
            "We do not sell personal information. We may share information with service providers that help us operate the product, comply with law, process payments, provide support, or protect the security of GetU Translate.",
          ],
        },
        {
          title: "6. Retention",
          paragraphs: [
            "We keep information for as long as needed to provide the product, maintain business records, resolve disputes, comply with legal obligations, and enforce our agreements. We remove or anonymize data when it is no longer needed.",
          ],
        },
        {
          title: "7. Your choices",
          paragraphs: [
            "You may request access, correction, deletion, or export of your personal information by contacting us. You can also adjust extension settings and cancel paid subscriptions through the subscription management flow.",
          ],
        },
        {
          title: "8. Security",
          paragraphs: [
            "We use reasonable technical and organizational safeguards to protect information. No online service can guarantee absolute security.",
          ],
        },
        {
          title: "9. Contact",
          paragraphs: [
            "Privacy questions can be sent to support@getutranslate.com.",
          ],
        },
      ],
    },
    terms: {
      title: "Terms of Service",
      description: "These terms govern your access to and use of GetU Translate, including our browser extension, website, accounts, and paid subscription features.",
      sections: [
        {
          title: "1. Acceptance of these terms",
          paragraphs: [
            "By installing, accessing, or using GetU Translate, you agree to these Terms of Service. If you do not agree, do not use the product.",
          ],
        },
        {
          title: "2. Product description",
          paragraphs: [
            "GetU Translate is an AI-powered browser translation and language-learning tool. It supports web page translation, selected-text translation, video subtitle translation, article reading assistance, text-to-speech, and configurable AI provider settings.",
          ],
        },
        {
          title: "3. Accounts and subscriptions",
          paragraphs: [
            "Some features may require an account or paid subscription. You are responsible for keeping your account information accurate and for protecting your login credentials.",
            "Paid plans renew automatically unless cancelled before the renewal date. You can manage cancellation and billing through the checkout or subscription management flow provided at purchase.",
          ],
        },
        {
          title: "4. Payments",
          paragraphs: [
            "Payments are processed by Stripe. Stripe may collect payment details, apply taxes, issue invoices, and handle payment-related compliance. GetU Translate does not store full credit card numbers.",
          ],
        },
        {
          title: "5. Acceptable use",
          paragraphs: ["You agree not to misuse GetU Translate, including by:"],
          list: [
            "Violating applicable laws or third-party rights.",
            "Attempting to reverse engineer, disrupt, or overload the service.",
            "Using the product to process content you are not permitted to use.",
            "Bypassing usage limits, access controls, or security protections.",
          ],
        },
        {
          title: "6. AI translation output",
          paragraphs: [
            "AI-generated translations may be inaccurate, incomplete, or unsuitable for professional, legal, medical, financial, or safety-critical use. You are responsible for reviewing outputs before relying on them.",
          ],
        },
        {
          title: "7. Intellectual property",
          paragraphs: [
            "GetU Translate and its software, branding, website, and related materials are protected by intellectual property laws. You retain rights to your own content, subject to the permissions needed for the product to process and translate it.",
          ],
        },
        {
          title: "8. Availability and changes",
          paragraphs: [
            "We may update, suspend, or discontinue features as the product evolves. We aim to keep the service reliable, but we do not guarantee uninterrupted or error-free operation.",
          ],
        },
        {
          title: "9. Termination",
          paragraphs: [
            "We may suspend or terminate access if you violate these terms, create risk for the product or other users, or use the service unlawfully.",
          ],
        },
        {
          title: "10. Contact",
          paragraphs: [
            "Questions about these terms can be sent to support@getutranslate.com.",
          ],
        },
      ],
    },
    refund: {
      title: "Refund Policy",
      description: "This policy describes how refunds work for GetU Translate paid subscriptions and purchases.",
      sections: [
        {
          title: "1. Refund window",
          paragraphs: [
            "If you are not satisfied with a paid GetU Translate subscription, you may request a refund within 14 days of the initial purchase or renewal charge.",
          ],
        },
        {
          title: "2. How to request a refund",
          paragraphs: [
            "Contact support@getutranslate.com with the email address used for purchase, the Stripe order or transaction number if available, and a brief reason for the request.",
          ],
        },
        {
          title: "3. Processing",
          paragraphs: [
            "Approved refunds are processed back to the original payment method through Stripe. The time it takes for funds to appear depends on the payment method and financial institution.",
          ],
        },
        {
          title: "4. Non-refundable cases",
          paragraphs: ["Refunds may be declined when:"],
          list: [
            "The request is made more than 14 days after the relevant charge.",
            "The account shows abuse, fraud, or violation of our Terms of Service.",
            "The purchase was already refunded, charged back, or otherwise reversed.",
          ],
        },
        {
          title: "5. Cancellation",
          paragraphs: [
            "Cancelling a subscription stops future renewals but does not automatically refund prior charges. After cancellation, paid features remain available until the end of the current billing period unless a refund is approved.",
          ],
        },
        {
          title: "6. Contact",
          paragraphs: [
            "Billing and refund questions can be sent to support@getutranslate.com.",
          ],
        },
      ],
    },
    guide: {
      eyebrow: "Getting started",
      stepLabel: "Step 1",
      step1Title: "Almost there! Pin GetU Translate",
      step1Intro: "You just installed GetU Translate. Pin it to your toolbar so it's always one click away when you need to translate a page, a snippet, or a video subtitle.",
      pinTitle: "How to pin",
      pinSteps: [
        "Click the puzzle icon in the top-right of your browser toolbar.",
        "Find GetU Translate in the list.",
        "Click the pin icon next to GetU Translate.",
      ],
      tryTitle: "What's next",
      tryBody: "Once pinned, open any web page and click the GetU Translate icon to start translating.",
      openPricing: "View pricing",
      openHome: "Go to home",
    },
    translate: {
      metaTitle: "Text translation · GetU Translate",
      metaDescription: "Translate text with 11 AI models side by side. Compare Google, Microsoft, GPT, Claude, Gemini, DeepSeek and more.",
      shell: {
        text: "Text",
        document: "Document",
        upgradePro: "Upgrade Pro",
      },
      page: {
        inputPlaceholder: "Type or paste text to translate…",
        translateButton: "Translate",
        translateLoginButton: "Log in to translate",
        translateLoadingButton: "Loading…",
        clearButton: "Clear",
        charCounterTemplate: "{used} / {limit}",
        charLimitExceeded: "Over limit — split the text or upgrade to Pro.",
        quotaLabel: "This month",
        historyToggle: "History",
        historyComingSoon: "History is coming next.",
        upgradePromptShort: "Pro-only model. Upgrade to Pro for OpenAI, DeepSeek, Claude, Gemini and more.",
        notImplementedToast: "M6.5 will wire real translation. The UI shell is in place — try dragging a model card to reorder.",
        cardLoading: "Translating…",
        cardErrorFallback: "Translation failed",
      },
      history: {
        toggleOpen: "Show history",
        toggleClose: "Hide history",
        searchPlaceholder: "Search history…",
        clearAllButton: "Clear all",
        emptyState: "No history yet. Translate something to see it here.",
        loading: "Loading history…",
        groupToday: "Today",
        groupYesterday: "Yesterday",
        groupThisWeek: "This week",
        groupOlder: "Older",
        clearConfirmTemplate: "Delete all {count} history entries? This cannot be undone.",
        deleteEntryAriaLabel: "Delete this history entry",
      },
      upgradeModal: {
        titles: {
          free_quota_exceeded: "Monthly limit reached",
          pro_model_clicked: "Pro model — upgrade to unlock",
          pdf_quota_exceeded: "PDF limit reached",
          char_limit_exceeded: "Character limit reached",
          history_cleanup_warning: "History limit reached",
        },
        perks: {
          header: "Free vs Pro",
          rowRequests: "Requests",
          rowModels: "AI models",
          rowChars: "Characters",
          rowPdf: "PDF pages",
          rowHistory: "History",
        },
        cta: "Upgrade to Pro",
        close: "Close",
      },
      quotaBadge: {
        tooltip: "Requests {textUsed}/{textLimit} · Tokens {tokenUsed}/{tokenLimit} · PDF {pdfUsed}/{pdfLimit}",
      },
    },
    document: {
      metaTitle: "Document translation · GetU Translate",
      metaDescription: "Translate PDF documents with multilingual AI. Upload your PDF and get a fully translated copy.",
      uploadButton: "Choose a PDF",
      dragDropHint: "Drop a PDF here, or click to browse.",
      limitsTemplate: "Up to {maxMB} MB · {maxPages} pages",
      clearFile: "Remove",
      modelPicker: "Model",
      modelLockedSuffix: "(Pro)",
      submit: "Translate document",
      uploadingTemplate: "Uploading {pct}%",
      creating: "Creating job…",
      resultPlaceholder: "Your translation job has been queued. Job id: {jobId}",
      fromUrl: {
        heading: "Translating PDF from URL",
        loading: "Fetching PDF from the source URL…",
      },
      errors: {
        heading: "Something went wrong",
        notPdf: "That file isn't a PDF.",
        fileTooLarge: "File is over the 50 MB limit.",
        r2Unavailable: "PDF upload is temporarily unavailable. Please try again later.",
        presignFailed: "Could not initialize the upload.",
        uploadFailed: "Upload failed.",
        fromUrlFailed: "Could not fetch the PDF from that URL.",
        scannedPdfError: "Could not read the PDF — it may be a scanned image or encrypted file.",
      },
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
      monthlyPrice: "$5/月",
      yearlyPrice: "$50/年",
      cnyMonthlyPrice: "¥29/月",
      cnyYearlyPrice: "¥299/年",
      proNote: "按月支付，或按年支付 $50。",
      proFeatures: [
        "更高翻译用量",
        "高级文章和字幕翻译支持",
        "优先体验新的 AI 阅读功能",
        "账单和账户问题邮件支持",
      ],
      monthly: "月付",
      yearly: "年付",
      subscribe: "订阅（自动续费）",
      buyOnce: "立即购买（一次性）",
      billingNoteUsd: "订阅按计费周期自动续费，随时可通过客户门户取消。",
      billingNoteCny: "一次性付款，到期后需重新购买。支持信用卡、支付宝、微信支付。",
      comingSoon: "即将推出",
      loginToSubscribe: "登录后购买",
      loading: "加载中...",
      billingTitle: "账单条款",
      billingBody: "价格以人民币列出，可能会根据你的所在地收取税费。付款、发票和订单管理由 Stripe 安全处理。",
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
      methodPasswordTab: "密码",
      methodCodeTab: "邮箱验证码",
      code: "验证码",
      codePlaceholder: "6 位验证码",
      sendCode: "发送验证码",
      sendingCode: "发送中...",
      codeSent: "验证码已发送，请查收邮件。",
      resendCodeIn: "{seconds} 秒后可重新发送",
      resendCode: "重新发送",
      sendCodeFailed: "发送失败，请稍后重试。",
      forgotPassword: "忘记密码？",
      passkeyHint: "提示：登录后可在「设置」里添加 Passkey，下次一键登录。",
      submit: "登录",
      submitSignUp: "创建账户",
    },
    settings: {
      eyebrow: "账户",
      title: "账户设置",
      intro: "管理你登录 GetU Translate 的方式。",
      signedInAs: "当前登录",
      signOut: "退出登录",
      passkeysTitle: "Passkey",
      passkeysIntro: "添加 Passkey，下次可以用指纹、面容或设备 PIN 一键登录，无需密码或验证码。",
      addPasskey: "添加 Passkey",
      adding: "添加中...",
      noPasskeys: "尚未添加 Passkey。",
      remove: "移除",
      removing: "移除中...",
      passkeyAdded: "Passkey 已添加。",
      passkeyAddFailed: "添加 Passkey 失败。",
      passkeyRemoveFailed: "移除失败。",
      created: "添加于",
      unsupported: "当前浏览器不支持 Passkey。",
      requireSignIn: "请先登录以管理账户。",
      goToLogIn: "前往登录",
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
      sections: [
        {
          title: "1. 我们收集的信息",
          paragraphs: ["根据你使用 GetU Translate 的方式，我们可能收集："],
          list: [
            "账户信息，例如邮箱地址和登录信息。",
            "来自 Stripe 的订阅和账单状态。",
            "产品设置、语言偏好和配置选择。",
            "技术数据，例如浏览器类型、扩展版本、诊断信息和错误日志。",
            "当某项功能需要通过 AI 或翻译提供商处理时，你主动提交用于翻译的内容。",
          ],
        },
        {
          title: "2. 我们如何使用信息",
          paragraphs: ["我们使用这些信息来提供和改进 GetU Translate，包括："],
          list: [
            "运行翻译、字幕、文章阅读和文本转语音功能。",
            "管理账户、订阅、支持和安全。",
            "排查产品问题并防止滥用。",
            "履行法律、税务和支付相关义务。",
          ],
        },
        {
          title: "3. AI 与翻译提供商",
          paragraphs: [
            "GetU Translate 可能会将你选择翻译的文本发送给受支持的 AI 或翻译提供商。如果你配置了自己的提供商账户或 API Key，还可能同时受该提供商的条款和隐私政策约束。",
          ],
        },
        {
          title: "4. 支付",
          paragraphs: [
            "付款由 Stripe 处理。Stripe 可能会处理个人信息和支付信息，以完成购买、管理订阅、防止欺诈、计算税费和开具发票。我们只会接收有限的账单信息，例如订阅状态和交易标识符。",
          ],
        },
        {
          title: "5. 信息共享",
          paragraphs: [
            "我们不会出售个人信息。我们可能会与帮助我们运营产品、遵守法律、处理支付、提供支持或保护 GetU Translate 安全的服务提供商共享信息。",
          ],
        },
        {
          title: "6. 保留期限",
          paragraphs: [
            "我们会在提供产品、维护业务记录、解决争议、履行法律义务和执行协议所需的期限内保留信息。在不再需要时，我们会删除或匿名化这些数据。",
          ],
        },
        {
          title: "7. 你的选择",
          paragraphs: [
            "你可以联系我们，请求访问、更正、删除或导出你的个人信息。你也可以通过扩展设置调整相关选项，并通过订阅管理流程取消付费订阅。",
          ],
        },
        {
          title: "8. 安全",
          paragraphs: [
            "我们会采取合理的技术和组织措施保护信息安全。但任何在线服务都无法保证绝对安全。",
          ],
        },
        {
          title: "9. 联系方式",
          paragraphs: [
            "有关隐私的问题可发送至 support@getutranslate.com。",
          ],
        },
      ],
    },
    terms: {
      title: "服务条款",
      description: "这些条款适用于你访问和使用 GetU Translate，包括浏览器扩展、网站、账户和付费订阅功能。",
      sections: [
        {
          title: "1. 接受这些条款",
          paragraphs: [
            "当你安装、访问或使用 GetU Translate 时，即表示你同意本服务条款。如果你不同意，请不要使用本产品。",
          ],
        },
        {
          title: "2. 产品说明",
          paragraphs: [
            "GetU Translate 是一款由 AI 驱动的浏览器翻译和语言学习工具，支持网页翻译、划词翻译、视频字幕翻译、文章阅读辅助、文本转语音以及可配置的 AI Provider 设置。",
          ],
        },
        {
          title: "3. 账户与订阅",
          paragraphs: [
            "部分功能可能需要账户或付费订阅。你有责任确保账户信息准确，并妥善保管登录凭证。",
            "付费套餐会在续费日前未取消的情况下自动续费。你可以通过购买时提供的结账或订阅管理流程管理取消和账单。",
          ],
        },
        {
          title: "4. 支付",
          paragraphs: [
            "付款由 Stripe 处理。Stripe 可能会收集支付信息、计算税费、开具发票并处理支付合规事项。GetU Translate 不会存储完整的信用卡号。",
          ],
        },
        {
          title: "5. 合理使用",
          paragraphs: ["你同意不会以以下方式滥用 GetU Translate："],
          list: [
            "违反适用法律或第三方权利。",
            "试图逆向工程、干扰或过载服务。",
            "使用本产品处理你无权使用的内容。",
            "绕过使用限制、访问控制或安全保护。",
          ],
        },
        {
          title: "6. AI 翻译输出",
          paragraphs: [
            "AI 生成的翻译可能不准确、不完整，或不适用于专业、法律、医疗、金融或其他安全关键场景。在依赖这些输出之前，你应自行审查。",
          ],
        },
        {
          title: "7. 知识产权",
          paragraphs: [
            "GetU Translate 及其软件、品牌、网站和相关材料均受知识产权法律保护。你仍保有自己内容的权利，但需授予产品处理和翻译这些内容所必需的权限。",
          ],
        },
        {
          title: "8. 可用性与变更",
          paragraphs: [
            "随着产品演进，我们可能会更新、暂停或终止部分功能。我们会尽力保持服务可靠，但不保证服务持续不中断或完全无错误。",
          ],
        },
        {
          title: "9. 终止",
          paragraphs: [
            "如果你违反这些条款、给产品或其他用户带来风险，或以非法方式使用服务，我们可能暂停或终止你的访问权限。",
          ],
        },
        {
          title: "10. 联系方式",
          paragraphs: [
            "有关这些条款的问题可发送至 support@getutranslate.com。",
          ],
        },
      ],
    },
    refund: {
      title: "退款政策",
      description: "本政策说明 GetU Translate 付费订阅和购买的退款规则。",
      sections: [
        {
          title: "1. 退款期限",
          paragraphs: [
            "如果你对付费版 GetU Translate 订阅不满意，可在首次购买或续费扣款后的 14 天内申请退款。",
          ],
        },
        {
          title: "2. 如何申请退款",
          paragraphs: [
            "请发送邮件至 support@getutranslate.com，并提供购买时使用的邮箱、可用时的 Stripe 订单号或交易号，以及简要退款原因。",
          ],
        },
        {
          title: "3. 处理方式",
          paragraphs: [
            "经批准的退款将通过 Stripe 原路退回到原支付方式。到账时间取决于支付方式和金融机构。",
          ],
        },
        {
          title: "4. 不可退款情形",
          paragraphs: ["在以下情况下，退款申请可能会被拒绝："],
          list: [
            "申请时间距离相关扣款已超过 14 天。",
            "账户存在滥用、欺诈或违反服务条款的行为。",
            "该购买已被退款、拒付或以其他方式撤销。",
          ],
        },
        {
          title: "5. 取消订阅",
          paragraphs: [
            "取消订阅只会阻止未来续费，不会自动退还之前的扣款。取消后，除非退款获批，付费功能仍可使用到当前计费周期结束。",
          ],
        },
        {
          title: "6. 联系方式",
          paragraphs: [
            "有关账单和退款的问题可发送至 support@getutranslate.com。",
          ],
        },
      ],
    },
    guide: {
      eyebrow: "新手引导",
      stepLabel: "第 1 步",
      step1Title: "就差一步！请把 GetU Translate 固定到工具栏",
      step1Intro: "你已经成功安装了 GetU Translate。把它固定到浏览器工具栏，之后每次想翻译网页、划词或视频字幕，都可以一键打开。",
      pinTitle: "如何固定",
      pinSteps: [
        "点击浏览器右上角的扩展（拼图）图标。",
        "在列表中找到 GetU Translate。",
        "点击 GetU Translate 旁边的图钉图标。",
      ],
      tryTitle: "接下来",
      tryBody: "固定好之后，打开任意网页，点击工具栏里的 GetU Translate 图标就可以开始翻译。",
      openPricing: "查看价格",
      openHome: "回到首页",
    },
    translate: {
      metaTitle: "文本翻译 · GetU Translate",
      metaDescription: "11 个 AI 模型并排对比翻译：谷歌、微软、GPT、Claude、Gemini、DeepSeek 等。",
      shell: {
        text: "文本",
        document: "文档",
        upgradePro: "升级 Pro",
      },
      page: {
        inputPlaceholder: "请输入或粘贴文本进行翻译…",
        translateButton: "翻译",
        translateLoginButton: "登录后翻译",
        translateLoadingButton: "加载中…",
        clearButton: "清空",
        charCounterTemplate: "{used} / {limit}",
        charLimitExceeded: "超出字符上限 — 请拆分文本或升级 Pro。",
        quotaLabel: "本月剩余",
        historyToggle: "历史",
        historyComingSoon: "翻译历史即将上线。",
        upgradePromptShort: "Pro 会员专用模型，升级 Pro 解锁 OpenAI、DeepSeek、Claude、Gemini 等。",
        notImplementedToast: "M6.5 将接通真实翻译。UI 已就绪 — 可以试试拖拽模型卡片重新排序。",
        cardLoading: "翻译中…",
        cardErrorFallback: "翻译失败",
      },
      history: {
        toggleOpen: "显示历史",
        toggleClose: "隐藏历史",
        searchPlaceholder: "搜索历史记录…",
        clearAllButton: "清空全部",
        emptyState: "暂无历史。翻译一段文本就会出现在这里。",
        loading: "正在加载历史…",
        groupToday: "今天",
        groupYesterday: "昨天",
        groupThisWeek: "本周",
        groupOlder: "更早",
        clearConfirmTemplate: "确定删除全部 {count} 条历史记录？此操作不可恢复。",
        deleteEntryAriaLabel: "删除此条历史",
      },
      upgradeModal: {
        titles: {
          free_quota_exceeded: "本月用量已达上限",
          pro_model_clicked: "Pro 专属模型 — 升级后解锁",
          pdf_quota_exceeded: "PDF 页数已达上限",
          char_limit_exceeded: "字符数已达上限",
          history_cleanup_warning: "历史记录已达上限",
        },
        perks: {
          header: "免费版 vs Pro",
          rowRequests: "请求次数",
          rowModels: "AI 模型",
          rowChars: "字符数",
          rowPdf: "PDF 页数",
          rowHistory: "历史记录",
        },
        cta: "立即升级 Pro",
        close: "关闭",
      },
      quotaBadge: {
        tooltip: "请求 {textUsed}/{textLimit} · Token {tokenUsed}/{tokenLimit} · PDF {pdfUsed}/{pdfLimit}",
      },
    },
    document: {
      metaTitle: "文档翻译 · GetU Translate",
      metaDescription: "用多语种 AI 翻译 PDF 文档。上传 PDF，获取完整译文。",
      uploadButton: "选择 PDF",
      dragDropHint: "拖拽 PDF 到这里，或点击选择文件。",
      limitsTemplate: "最大 {maxMB} MB · {maxPages} 页",
      clearFile: "移除",
      modelPicker: "模型",
      modelLockedSuffix: "（Pro）",
      submit: "翻译文档",
      uploadingTemplate: "上传中 {pct}%",
      creating: "正在创建任务…",
      resultPlaceholder: "翻译任务已排队。Job id：{jobId}",
      fromUrl: {
        heading: "正在通过 URL 翻译 PDF",
        loading: "正在从源链接抓取 PDF…",
      },
      errors: {
        heading: "出错了",
        notPdf: "这个文件不是 PDF。",
        fileTooLarge: "文件超过 50 MB 上限。",
        r2Unavailable: "PDF 上传服务暂不可用，请稍后再试。",
        presignFailed: "无法初始化上传。",
        uploadFailed: "上传失败。",
        fromUrlFailed: "无法从该 URL 抓取 PDF。",
        scannedPdfError: "无法读取 PDF — 可能是扫描件或加密文件。",
      },
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
      monthlyPrice: "$5/月",
      yearlyPrice: "$50/年",
      cnyMonthlyPrice: "¥29/月",
      cnyYearlyPrice: "¥299/年",
      proNote: "按月支付，或按年支付 $50。",
      proFeatures: [
        "更高翻譯用量",
        "進階文章和字幕翻譯支援",
        "優先體驗新的 AI 閱讀功能",
        "帳單和帳戶問題郵件支援",
      ],
      monthly: "月付",
      yearly: "年付",
      subscribe: "訂閱（自動續費）",
      buyOnce: "立即購買（一次性）",
      billingNoteUsd: "訂閱按計費週期自動續費，隨時可透過客戶入口取消。",
      billingNoteCny: "一次性付款，到期後需重新購買。支援信用卡、支付寶、微信支付。",
      comingSoon: "即將推出",
      loginToSubscribe: "登入後購買",
      loading: "載入中...",
      billingTitle: "帳單條款",
      billingBody: "價格以人民幣列出，可能會依你的所在地收取稅費。付款、發票和訂單管理由 Stripe 安全處理。",
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
      methodPasswordTab: "密碼",
      methodCodeTab: "電子郵件驗證碼",
      code: "驗證碼",
      codePlaceholder: "6 位驗證碼",
      sendCode: "發送驗證碼",
      sendingCode: "發送中...",
      codeSent: "驗證碼已發送，請查收電子郵件。",
      resendCodeIn: "{seconds} 秒後可重新發送",
      resendCode: "重新發送",
      sendCodeFailed: "發送失敗，請稍後重試。",
      forgotPassword: "忘記密碼？",
      passkeyHint: "提示：登入後可在「設定」中新增 Passkey，下次一鍵登入。",
      submit: "登入",
      submitSignUp: "建立帳戶",
    },
    settings: {
      eyebrow: "帳戶",
      title: "帳戶設定",
      intro: "管理你登入 GetU Translate 的方式。",
      signedInAs: "目前登入",
      signOut: "登出",
      passkeysTitle: "Passkey",
      passkeysIntro: "新增 Passkey，下次可用指紋、面容或裝置 PIN 一鍵登入，無需密碼或驗證碼。",
      addPasskey: "新增 Passkey",
      adding: "新增中...",
      noPasskeys: "尚未新增 Passkey。",
      remove: "移除",
      removing: "移除中...",
      passkeyAdded: "Passkey 已新增。",
      passkeyAddFailed: "新增 Passkey 失敗。",
      passkeyRemoveFailed: "移除失敗。",
      created: "新增於",
      unsupported: "目前瀏覽器不支援 Passkey。",
      requireSignIn: "請先登入以管理帳戶。",
      goToLogIn: "前往登入",
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
      sections: [
        {
          title: "1. 我們收集的資訊",
          paragraphs: ["根據你使用 GetU Translate 的方式，我們可能收集："],
          list: [
            "帳戶資訊，例如電子郵件地址和登入資料。",
            "來自 Stripe 的訂閱和帳單狀態。",
            "產品設定、語言偏好和設定選項。",
            "技術資料，例如瀏覽器類型、擴充功能版本、診斷資訊和錯誤日誌。",
            "當某項功能需要透過 AI 或翻譯服務提供商處理時，你主動提交用於翻譯的內容。",
          ],
        },
        {
          title: "2. 我們如何使用資訊",
          paragraphs: ["我們使用這些資訊來提供並改進 GetU Translate，包括："],
          list: [
            "運作翻譯、字幕、文章閱讀和文字轉語音功能。",
            "管理帳戶、訂閱、支援和安全。",
            "排查產品問題並防止濫用。",
            "履行法律、稅務和付款相關義務。",
          ],
        },
        {
          title: "3. AI 與翻譯服務提供商",
          paragraphs: [
            "GetU Translate 可能會將你選擇翻譯的文字傳送給支援的 AI 或翻譯服務提供商。如果你設定了自己的提供商帳戶或 API Key，也可能同時受到該提供商條款與隱私政策的約束。",
          ],
        },
        {
          title: "4. 付款",
          paragraphs: [
            "付款由 Stripe 處理。Stripe 可能會處理個人資訊和付款資訊，以完成購買、管理訂閱、防止詐欺、計算稅費及開立發票。我們只會收到有限的帳單資訊，例如訂閱狀態和交易識別碼。",
          ],
        },
        {
          title: "5. 資訊分享",
          paragraphs: [
            "我們不會出售個人資訊。我們可能會與協助我們營運產品、遵守法律、處理付款、提供支援或保護 GetU Translate 安全的服務提供商分享資訊。",
          ],
        },
        {
          title: "6. 保留期間",
          paragraphs: [
            "我們會在提供產品、維護商業紀錄、解決爭議、履行法律義務和執行協議所需的期間內保留資訊。當不再需要時，我們會刪除或匿名化這些資料。",
          ],
        },
        {
          title: "7. 你的選擇",
          paragraphs: [
            "你可以聯絡我們，要求存取、更正、刪除或匯出你的個人資訊。你也可以透過擴充功能設定調整相關選項，並透過訂閱管理流程取消付費訂閱。",
          ],
        },
        {
          title: "8. 安全",
          paragraphs: [
            "我們會採取合理的技術與組織措施保護資訊安全。但任何線上服務都無法保證絕對安全。",
          ],
        },
        {
          title: "9. 聯絡方式",
          paragraphs: [
            "如有隱私相關問題，請寄送至 support@getutranslate.com。",
          ],
        },
      ],
    },
    terms: {
      title: "服務條款",
      description: "這些條款適用於你存取和使用 GetU Translate，包括瀏覽器擴充功能、網站、帳戶和付費訂閱功能。",
      sections: [
        {
          title: "1. 接受這些條款",
          paragraphs: [
            "當你安裝、存取或使用 GetU Translate，即表示你同意本服務條款。如果你不同意，請不要使用本產品。",
          ],
        },
        {
          title: "2. 產品說明",
          paragraphs: [
            "GetU Translate 是一款由 AI 驅動的瀏覽器翻譯與語言學習工具，支援網頁翻譯、劃詞翻譯、影片字幕翻譯、文章閱讀輔助、文字轉語音以及可設定的 AI Provider 選項。",
          ],
        },
        {
          title: "3. 帳戶與訂閱",
          paragraphs: [
            "部分功能可能需要帳戶或付費訂閱。你有責任確保帳戶資訊正確，並妥善保管登入憑證。",
            "付費方案會在續費日前未取消的情況下自動續費。你可以透過購買時提供的結帳或訂閱管理流程管理取消與帳單。",
          ],
        },
        {
          title: "4. 付款",
          paragraphs: [
            "付款由 Stripe 處理。Stripe 可能會收集付款資訊、計算稅費、開立發票並處理付款合規事項。GetU Translate 不會儲存完整信用卡號。",
          ],
        },
        {
          title: "5. 合理使用",
          paragraphs: ["你同意不會以下列方式濫用 GetU Translate："],
          list: [
            "違反適用法律或第三方權利。",
            "試圖逆向工程、干擾或使服務過載。",
            "使用本產品處理你無權使用的內容。",
            "繞過使用限制、存取控制或安全保護。",
          ],
        },
        {
          title: "6. AI 翻譯輸出",
          paragraphs: [
            "AI 生成的翻譯可能不準確、不完整，或不適用於專業、法律、醫療、金融或其他安全關鍵場景。在依賴這些輸出前，你應自行審查。",
          ],
        },
        {
          title: "7. 智慧財產權",
          paragraphs: [
            "GetU Translate 及其軟體、品牌、網站和相關資料均受智慧財產權法律保護。你仍保有自己內容的權利，但需授予產品處理和翻譯該內容所必需的權限。",
          ],
        },
        {
          title: "8. 可用性與變更",
          paragraphs: [
            "隨著產品演進，我們可能會更新、暫停或終止部分功能。我們會盡力維持服務可靠，但不保證服務持續不中斷或完全無錯誤。",
          ],
        },
        {
          title: "9. 終止",
          paragraphs: [
            "如果你違反這些條款、對產品或其他使用者造成風險，或以非法方式使用服務，我們可能暫停或終止你的存取權限。",
          ],
        },
        {
          title: "10. 聯絡方式",
          paragraphs: [
            "如對這些條款有疑問，請寄送至 support@getutranslate.com。",
          ],
        },
      ],
    },
    refund: {
      title: "退款政策",
      description: "本政策說明 GetU Translate 付費訂閱和購買的退款規則。",
      sections: [
        {
          title: "1. 退款期限",
          paragraphs: [
            "如果你對付費版 GetU Translate 訂閱不滿意，可在首次購買或續費扣款後 14 天內申請退款。",
          ],
        },
        {
          title: "2. 如何申請退款",
          paragraphs: [
            "請寄信至 support@getutranslate.com，並提供購買時使用的電子郵件、可用時的 Stripe 訂單號或交易號，以及簡要退款原因。",
          ],
        },
        {
          title: "3. 處理方式",
          paragraphs: [
            "經核准的退款將透過 Stripe 原路退回至原付款方式。入帳時間取決於付款方式與金融機構。",
          ],
        },
        {
          title: "4. 不可退款情形",
          paragraphs: ["在以下情況下，退款申請可能會被拒絕："],
          list: [
            "申請時間距離相關扣款已超過 14 天。",
            "帳戶存在濫用、詐欺或違反服務條款的行為。",
            "該筆購買已被退款、拒付或以其他方式撤銷。",
          ],
        },
        {
          title: "5. 取消訂閱",
          paragraphs: [
            "取消訂閱只會停止未來續費，不會自動退還先前的扣款。取消後，除非退款獲准，付費功能仍可使用至當前計費週期結束。",
          ],
        },
        {
          title: "6. 聯絡方式",
          paragraphs: [
            "如有帳單與退款相關問題，請寄送至 support@getutranslate.com。",
          ],
        },
      ],
    },
    guide: {
      eyebrow: "新手引導",
      stepLabel: "第 1 步",
      step1Title: "就差一步！請把 GetU Translate 釘到工具列",
      step1Intro: "你已經成功安裝了 GetU Translate。把它釘到瀏覽器工具列，之後每次想翻譯網頁、劃詞或影片字幕，都可以一鍵開啟。",
      pinTitle: "如何釘選",
      pinSteps: [
        "點擊瀏覽器右上角的擴充功能（拼圖）圖示。",
        "在清單中找到 GetU Translate。",
        "點擊 GetU Translate 旁邊的圖釘圖示。",
      ],
      tryTitle: "接下來",
      tryBody: "釘選完成後，開啟任意網頁，點擊工具列中的 GetU Translate 圖示即可開始翻譯。",
      openPricing: "查看價格",
      openHome: "回到首頁",
    },
    translate: {
      metaTitle: "文字翻譯 · GetU Translate",
      metaDescription: "11 個 AI 模型並排對比翻譯：Google、Microsoft、GPT、Claude、Gemini、DeepSeek 等。",
      shell: {
        text: "文字",
        document: "文件",
        upgradePro: "升級 Pro",
      },
      page: {
        inputPlaceholder: "請輸入或貼上文字進行翻譯…",
        translateButton: "翻譯",
        translateLoginButton: "登入後翻譯",
        translateLoadingButton: "載入中…",
        clearButton: "清除",
        charCounterTemplate: "{used} / {limit}",
        charLimitExceeded: "超出字元上限 — 請拆分文字或升級 Pro。",
        quotaLabel: "本月剩餘",
        historyToggle: "歷史",
        historyComingSoon: "翻譯歷史即將上線。",
        upgradePromptShort: "Pro 會員專用模型，升級 Pro 解鎖 OpenAI、DeepSeek、Claude、Gemini 等。",
        notImplementedToast: "M6.5 將接通真實翻譯。UI 已就緒 — 可以試試拖曳模型卡片重新排序。",
        cardLoading: "翻譯中…",
        cardErrorFallback: "翻譯失敗",
      },
      history: {
        toggleOpen: "顯示歷史",
        toggleClose: "隱藏歷史",
        searchPlaceholder: "搜尋歷史紀錄…",
        clearAllButton: "清空全部",
        emptyState: "暫無歷史。翻譯一段文字就會出現在這裡。",
        loading: "正在載入歷史…",
        groupToday: "今天",
        groupYesterday: "昨天",
        groupThisWeek: "本週",
        groupOlder: "更早",
        clearConfirmTemplate: "確定刪除全部 {count} 條歷史紀錄？此操作不可恢復。",
        deleteEntryAriaLabel: "刪除此條歷史",
      },
      upgradeModal: {
        titles: {
          free_quota_exceeded: "本月用量已達上限",
          pro_model_clicked: "Pro 專屬模型 — 升級後解鎖",
          pdf_quota_exceeded: "PDF 頁數已達上限",
          char_limit_exceeded: "字元數已達上限",
          history_cleanup_warning: "歷史紀錄已達上限",
        },
        perks: {
          header: "免費版 vs Pro",
          rowRequests: "請求次數",
          rowModels: "AI 模型",
          rowChars: "字元數",
          rowPdf: "PDF 頁數",
          rowHistory: "歷史紀錄",
        },
        cta: "立即升級 Pro",
        close: "關閉",
      },
      quotaBadge: {
        tooltip: "請求 {textUsed}/{textLimit} · Token {tokenUsed}/{tokenLimit} · PDF {pdfUsed}/{pdfLimit}",
      },
    },
    document: {
      metaTitle: "文件翻譯 · GetU Translate",
      metaDescription: "用多語種 AI 翻譯 PDF 文件。上傳 PDF，獲取完整譯文。",
      uploadButton: "選擇 PDF",
      dragDropHint: "拖曳 PDF 到此處，或點擊選擇檔案。",
      limitsTemplate: "最大 {maxMB} MB · {maxPages} 頁",
      clearFile: "移除",
      modelPicker: "模型",
      modelLockedSuffix: "（Pro）",
      submit: "翻譯文件",
      uploadingTemplate: "上傳中 {pct}%",
      creating: "正在建立任務…",
      resultPlaceholder: "翻譯任務已排入佇列。Job id：{jobId}",
      fromUrl: {
        heading: "正在透過 URL 翻譯 PDF",
        loading: "正在從來源連結抓取 PDF…",
      },
      errors: {
        heading: "發生錯誤",
        notPdf: "這個檔案不是 PDF。",
        fileTooLarge: "檔案超過 50 MB 上限。",
        r2Unavailable: "PDF 上傳服務暫不可用，請稍後再試。",
        presignFailed: "無法初始化上傳。",
        uploadFailed: "上傳失敗。",
        fromUrlFailed: "無法從該 URL 抓取 PDF。",
        scannedPdfError: "無法讀取 PDF — 可能是掃描件或加密檔案。",
      },
    },
  },
}

export function getMessages(locale: Locale): Messages {
  return messages[locale]
}
