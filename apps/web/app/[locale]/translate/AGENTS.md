<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# /translate (M6.4)

## Purpose

Web text-translation page at `/[locale]/translate`. M6.4 ships the **UI shell only** — full layout, drag-to-reorder, char limit enforcement, locked-Pro state, demo data — but **no real translation calls** (M6.5 wires those).

## Key Files

| File | Description |
| --- | --- |
| `page.tsx` | Server entry. Resolves locale, loads i18n, renders `SiteShell` + `TranslateClient` island. Owns `<Metadata>`. Imports `./styles.css`. |
| `translate-client.tsx` | Top-level `'use client'` island. Owns input text, source/target lang, results state. Wires button handlers (currently mocked). |
| `demo-data.ts` | Hard-coded English input + 11 zh-CN demo translations. Shown to anonymous visitors and as initial state to logged-in users. SEO-friendly (renders in static HTML). |
| `components/TranslateShell.tsx` | Left sidebar nav (`Text` / `Document` / `Upgrade Pro`). Wraps the canvas. |
| `components/LangPicker.tsx` | Source/target language dropdowns + swap button. Hard-coded short list for M6.4; full ISO-639 list lands in M6.5. |
| `components/ModelGrid.tsx` | Vertically scrollable list of all 11 model cards. `@dnd-kit/core` + `@dnd-kit/sortable` for drag reorder. Order persists to `localStorage` (`getu.translate.model-order.v1`). |
| `components/ModelCard.tsx` | Single model column. Renders translation, loading, error, or **locked** Pro-CTA state. |
| `components/QuotaBadge.tsx` | Right-aligned quota indicator. Currently mock numbers; real wiring in M6.7. |
| `styles.css` | Page-scoped CSS. Uses CSS vars from globals where possible. |

## For AI Agents

### Working In This Directory

- **Static export constraint**: `apps/web` runs with `output: "export"`. Anything that touches state, `useEffect`, `localStorage`, or routing hooks must be inside `'use client'` files. The page entry deliberately keeps server-rendered metadata + i18n loading on the server side and delegates everything interactive to `translate-client.tsx`.
- **Model registry is the source of truth**: import `TRANSLATE_MODELS` from `@getu/definitions`. Do **not** hard-code model IDs in this directory.
- **Plan derivation is M6.4-mocked**: `translate-client.tsx` treats every signed-in user as `free`. Replace with `loadEntitlements`-derived tier in M6.7.
- **No real API calls in M6.4**: the Translate button shows a placeholder alert. Resist the urge to wire `orpcClient.translate.translate(...)` here — that belongs in M6.5 along with streaming, error handling, and quota decrement.
- **Drag persistence**: `localStorage` key is `getu.translate.model-order.v1`. Bump the suffix when the model registry shape changes incompatibly.

### Testing Requirements

- M6.4 has no unit tests in this directory — all behavior is presentational and verified visually via `pnpm --filter @getu/web dev`.
- M6.5+ adds Vitest tests when real handlers land (currently all branches are stubbed and would test nothing).

### Common Patterns

- Locked card detection: `plan === 'free' && !isFreeTranslateModel(modelId)`.
- Char limit: `FREE_CHAR_LIMIT = 2000`, `PRO_CHAR_LIMIT = 20000`. Enforced in the input pane footer; the Translate button is disabled when over.
- Anonymous user: shows demo input + demo results pre-filled in every column (yes, even the Pro ones — the locked state only kicks in once the user is logged in as `free`).
