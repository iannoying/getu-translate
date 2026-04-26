/**
 * Demo data shown to anonymous (logged-out) visitors so the page renders
 * fully and conveys the product's value before requiring sign-in. Also
 * doubles as the initial state once the user logs in (overwritten on first
 * Translate click). All strings are deliberately short, neutral, and
 * branding-aware so they appear in Lighthouse / SEO crawls.
 */
import type { TranslateModelId } from "@getu/definitions"

export const DEMO_INPUT = "The quick brown fox jumps over the lazy dog. AI-powered translation makes cross-language reading effortless."

export const DEMO_RESULTS: Record<TranslateModelId, string> = {
  google: "敏捷的棕色狐狸跳过了那只懒狗。AI 驱动的翻译让跨语言阅读变得轻而易举。",
  microsoft: "敏捷的棕狐越过懒狗。AI 翻译让跨语种阅读变得轻松。",
  "deepseek-v4-pro": "迅捷的棕毛狐跃过慵懒的犬只。AI 翻译让跨语种阅读毫不费力。",
  "qwen-3.5-plus": "灵巧的棕狐跨越懒散的猎犬。借助 AI 翻译，跨语言阅读变得轻松自如。",
  "glm-5.1": "棕色的灵狐越过懒洋洋的犬只。AI 加持下的翻译，让跨语种阅读如行云流水。",
  "gemini-3-flash-preview": "敏捷的棕色狐狸一跃越过懒狗。借助 AI 翻译，跨语言阅读毫不费力。",
  "gemini-3.1-pro-preview": "敏捷的棕色狐狸轻盈地跃过那只慵懒的狗。AI 驱动的翻译，使跨越语种的阅读变得游刃有余。",
  "gpt-5.4-mini": "敏捷的棕色狐狸跳过了懒狗。AI 翻译让跨语言阅读变得简单。",
  "gpt-5.5": "矫健的棕狐越过懒洋洋的猎犬。在 AI 翻译的加持下，跨语阅读变得轻松愉悦。",
  "claude-sonnet-4-6": "敏捷的棕色狐狸跃过那只懒洋洋的狗。AI 驱动的翻译，让跨语言阅读如同母语般顺畅。",
  "coder-claude-4.7-opus": "灵敏的棕色狐狸优雅地跃过慵懒的猎犬。AI 翻译技术让跨越语种的阅读变得轻松且自然。",
}
