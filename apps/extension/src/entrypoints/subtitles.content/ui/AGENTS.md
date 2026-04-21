<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# ui

## Purpose

React layer for the subtitles overlay. All components run inside the Shadow Root mounted by `renderer/mount-subtitles-ui.tsx` and read state from the dedicated `subtitlesStore` (see `../atoms.ts`). The overlay renders the dual-line subtitle window (original + translation), a state badge for loading/error, a draggable handle that reanchors top/bottom relative to the video, and a glass-style settings panel that anchors above the YouTube controls bar. A second tiny React tree is rendered by `subtitles-translate-button.tsx` into the controls bar to toggle the panel.

## Key Files

| File                             | Description                                                                                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subtitles-container.tsx`        | Top-level overlay — gates `SubtitlesView` + `StateMessage` on `subtitlesDisplayAtom.isVisible` and always renders `SubtitlesSettingsPanel` on a higher z-layer.                                                        |
| `subtitles-view.tsx`             | The subtitle window itself: reads `videoSubtitles.style`, swaps original/translation order based on `translationPosition`, applies background opacity, and uses `useVerticalDrag` + `useControlsInfo` for positioning. |
| `subtitle-lines.tsx`             | `MainSubtitle` and `TranslationSubtitle`: subscribe to `currentSubtitleAtom`, apply `SUBTITLE_FONT_FAMILIES`, fontScale, color, and `dir`/`lang` via `getLanguageDirectionAndLang` for RTL targets.                    |
| `state-message.tsx`              | Floating badge bottom-left of the player showing localized `loading` text or the captured `error.message`, color-coded via OKLCH.                                                                                      |
| `subtitles-translate-button.tsx` | Tabler-free button rendered into the YouTube controls bar — Read Frog logo with ON/OFF chip, opens `subtitlesSettingsPanelOpenAtom`.                                                                                   |
| `subtitles-ui-context.tsx`       | React context that exposes `toggleSubtitles`, `downloadSourceSubtitles`, and the platform's `controlsConfig` to children without prop drilling.                                                                        |
| `use-controls-visible.ts`        | `useControlsInfo(ref, controlsConfig)` — `MutationObserver` on the video container's class subtree, recomputes height/visibility via the platform `ControlsConfig`.                                                    |
| `use-vertical-drag.ts`           | Stateful drag hook: tracks anchor (top/bottom), clamps within video bounds minus controls reservation, switches anchor when the subtitle crosses the video midline, persists final position via `onDragEnd`.           |

## Subdirectories

| Directory                   | Purpose                                                                                                                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subtitles-settings-panel/` | Floating panel anchored above the controls bar with a subtitles toggle and source-subtitles download button. Composed of `SettingsPanelShell` + `SubtitlesToggle` + `DownloadSourceSubtitles` + `SubtitlesSettingsItem`. (No nested AGENTS.md — descend if you add files.) |

## For AI Agents

### Working In This Directory

- All Jotai reads/writes go through atoms backed by `subtitlesStore` (the Provider is set in `mount-subtitles-ui.tsx`); `useAtomValue(..., { store: subtitlesStore })` is only needed for atoms read from outside the Provider tree (e.g., `SubtitlesTranslateButton` lives in a separate React root and explicitly passes the store).
- Use `Activity` (React 19) for hide/show transitions instead of conditional rendering when you need the children to keep state across visibility flips (used for original/translation lines and settings panel).
- The drag hook clamps to `videoRect.height - containerRect.height - reservedHeight` where `reservedHeight = controlsHeight` only when bottom-anchored and controls are visible. When refactoring, preserve the anchor-flip-on-midline behavior (`calculateAnchorPosition`).
- `useEffectEvent` (experimental React 19 hook) is used everywhere to avoid effect re-subscriptions when handler closures change — mirror that style for new event listeners on `window`/`document`.
- Color/typography styles for the panel use raw OKLCH and the `#d8a94b` brand gold; do not Tailwind-ify these without checking the panel's glass aesthetic.

### Testing Requirements

- Component tests live in `__tests__/subtitle-lines.test.tsx` and `subtitles-settings-panel/components/__tests__/...`. Run `pnpm test`.
- Use `@testing-library/react` against atoms by injecting a fresh `createStore()` or by mocking `configFieldsAtomMap.videoSubtitles`.
- `SKIP_FREE_API` does not affect this directory.

### Common Patterns

- Shadow-DOM-aware DOM walks: `getContainingShadowRoot(element)` is used to bridge from a React ref up through the shadow boundary to the YouTube player container (see `useControlsInfo`, `useVerticalDrag`).
- `MutationObserver` filtered to `attributes` + `attributeFilter: ["class"]` + `subtree: true` to detect YouTube's `ytp-autohide` toggling cheaply.
- Composed-event outside-click detection in `SettingsPanelShell` via `event.composedPath()` so clicks on the trigger button (in a different shadow root) are not treated as outside-click.
- `pointer-events: none` on overlay layers with `pointer-events: auto` on interactive elements so the underlying video stays clickable.
- The translate-button button mounts in its own React root inside the controls bar and is the only place that explicitly threads `subtitlesStore` because it is rendered before `Provider` is set up there.

## Dependencies

### Internal

- `../atoms` — `currentSubtitleAtom`, `subtitlesDisplayAtom`, `subtitlesShowStateAtom`, `subtitlesShowContentAtom`, `subtitlesPositionAtom`, `subtitlesSettingsPanelOpenAtom`, `subtitlesVisibleAtom`, `subtitlesStore`.
- `@/utils/atoms/config` (`configFieldsAtomMap.videoSubtitles`, `configFieldsAtomMap.language`).
- `@/utils/constants/subtitles` (`DEFAULT_SUBTITLE_POSITION`, `SUBTITLE_FONT_FAMILIES`, `SUBTITLES_VIEW_CLASS`, `STATE_MESSAGE_CLASS`, `TRANSLATE_BUTTON_CLASS`, `TRANSLATE_BUTTON_CONTAINER_ID`).
- `@/utils/host/dom/node` (`getContainingShadowRoot`), `@/utils/content/language-direction`, `@/utils/styles/utils` (`cn`).
- `@/components/ui/base-ui/*` — `Switch`, `Button`, `Label` (Base UI primitives styled via Tailwind/CVA).
- `@/components/providers/theme-provider`, `@/assets/icons/read-frog.png`.

### External

- `react` 19 — `Activity`, `useEffectEvent`, `useRef`, `useState`, `useEffect`, `useMemo`.
- `jotai` — `useAtom`, `useAtomValue`, `useSetAtom`.
- `@tabler/icons-react` — `IconGripHorizontal`, `IconSubtitles`, `IconDownload`, `IconLoader2`.
- `sonner` — toast for download failures.
- `#imports` — `i18n` for translated strings.

<!-- MANUAL: -->
