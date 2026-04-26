"use client"

/**
 * Source ↔ target language picker. M6.4 ships with a hand-curated short
 * list — full ISO-639 catalogue lookup lives in `@getu/definitions` and
 * will be wired in M6.5 alongside real translation calls. Keeping the list
 * tiny here avoids a 200-row dropdown on the demo page.
 */

export interface LangOption {
  code: string
  label: string
}

export const SOURCE_LANGUAGES: LangOption[] = [
  { code: "auto", label: "自动" },
  { code: "en", label: "英语" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁体中文" },
  { code: "ja", label: "日语" },
  { code: "ko", label: "韩语" },
  { code: "fr", label: "法语" },
  { code: "de", label: "德语" },
  { code: "es", label: "西班牙语" },
  { code: "ru", label: "俄语" },
]

export const TARGET_LANGUAGES: LangOption[] = SOURCE_LANGUAGES.filter(l => l.code !== "auto")

export function LangPicker({
  source,
  target,
  onSourceChange,
  onTargetChange,
  onSwap,
}: {
  source: string
  target: string
  onSourceChange: (code: string) => void
  onTargetChange: (code: string) => void
  onSwap: () => void
}) {
  return (
    <div className="lang-picker">
      <label>
        <select value={source} onChange={e => onSourceChange(e.target.value)}>
          {SOURCE_LANGUAGES.map(l => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="lang-swap"
        onClick={onSwap}
        // Swap is a no-op when source is "auto" since it has no concrete code to swap into target.
        disabled={source === "auto"}
        aria-label="交换源语言和目标语言"
        title="交换源语言和目标语言"
      >
        ⇄
      </button>
      <label>
        <select value={target} onChange={e => onTargetChange(e.target.value)}>
          {TARGET_LANGUAGES.map(l => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
