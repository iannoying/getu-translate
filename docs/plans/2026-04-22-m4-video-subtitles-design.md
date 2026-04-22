# M4 · 字幕/视频平台扩展 · 设计文档

> **Parent:** `docs/plans/2026-04-20-roadmap-vs-immersive-translate.md` → M4
> **Status:** Brainstorming-validated 2026-04-22
> **Next:** 逐个 PR 独立走 `superpowers:writing-plans`，在 stacked worktree 里执行

## Goal

把现有 YouTube-only 字幕翻译扩展到 **Bilibili / TED / X (Twitter)** 三个平台，为 M4.5 的 Udemy / Coursera 和未来社区贡献做好插件化基础。不做 Netflix（DRM + 沉浸式翻译持续翻车前车之鉴）。

## Non-Goals

- Netflix / Disney+ / Hulu 等 DRM 平台（列入 M4+1，视用户反馈再议）
- Udemy / Coursera（列入 M4.5，单独里程碑）
- 字幕翻译 UI 重设计（保持现有 Shadow Root overlay + 控件）
- 新的商业化档位（继续复用 M0 entitlements + M2 input quota 模型）

## Key Decisions

| # | 主题 | 决策 |
|---|------|------|
| 1 | 覆盖平台 | **Bilibili + TED + X**（3 家，按用户价值排序） |
| 2 | Content script 架构 | **单一 content script**，match 4 个 URL 模式（youtube/bilibili/ted/x），runtime 按 hostname 分派 |
| 3 | 交付切片 | **4 stacked PR**：refactor + 每平台各 1 个 |
| 4 | 实施顺序 | Bilibili → TED → X（按预期用户量） |
| 5 | Manifest 权限 | 显式域名（非广域）— `*://*.bilibili.com/*, *://*.ted.com/*, *://twitter.com/*, *://x.com/*` |
| 6 | Options 配置 | 保持现有 `videoSubtitles.enabled` 单一开关（所有平台共享）；domain blocklist 沿用 `siteControl` |

## Architecture

### Leverage existing abstractions

现有 `subtitles.content/` 的 `UniversalVideoAdapter` + `platforms/` 架构 **已为多平台预留**。M4 主要是填 config，不是重写 adapter。

```
apps/extension/src/entrypoints/subtitles.content/
├─ index.tsx                   [MODIFY]  match 4 URL patterns
├─ runtime.ts                  [MODIFY]  hostname 分派到 init-*
├─ init-youtube-subtitles.ts   [EXISTS]
├─ init-bilibili-subtitles.ts  [NEW — PR M4.1]
├─ init-ted-subtitles.ts       [NEW — PR M4.2]
├─ init-x-subtitles.ts         [NEW — PR M4.3]
├─ platforms/
│  ├─ youtube.ts               [EXISTS]
│  ├─ bilibili.ts              [NEW]
│  ├─ ted.ts                   [NEW]
│  ├─ x.ts                     [NEW]
│  └─ adapter-factory.ts       [MODIFY]  加分派
└─ (其余逻辑共用)

apps/extension/src/utils/subtitles/
├─ fetchers/
│  ├─ youtube.ts               [EXISTS]
│  ├─ bilibili.ts              [NEW]  api.bilibili.com/x/player/v2
│  ├─ ted.ts                   [NEW]  /talks/{slug}/transcript.json
│  └─ x.ts                     [NEW]  VTT from HLS manifest or video.textTracks
└─ platform-fetcher.ts         [NEW/MODIFY]  抽象 SubtitleFetcher 接口
```

### PlatformConfig per platform

已存在的 `PlatformConfig` 字段（selectors, navigation events, controls metrics）扩展为通用形状。每家新平台只需：

```ts
// platforms/bilibili.ts
export const BILIBILI_CONFIG: PlatformConfig = {
  hostnamePattern: /\.bilibili\.com$/,
  urlPattern: /\/video\/[Bb][Vv]/,
  playerSelector: ".bpx-player-container",
  videoSelector: ".bpx-player-video video",
  subtitleTrackEvent: "bpxSubtitleReady",   // 自己的事件
  navigationStartEvent: "bilibili:navigate-start",  // 自己的 SPA 事件
  navigationFinishEvent: "bilibili:navigate-finish",
  controlsBarSelector: ".bpx-player-control-bottom-right",
}
```

URL pattern 必须是 path-sensitive（避免 `/space/` `/read/` 等非播放页误触发）。

### SubtitleFetcher 接口

```ts
export interface SubtitleFetcher {
  kind: PlatformKind                              // "youtube" | "bilibili" | "ted" | "x"
  /** 从当前页面抓取原始字幕轨道列表 */
  fetchTracks(videoId: string): Promise<RawTrack[]>
  /** 指定 track 拉取字幕 cues */
  fetchCues(track: RawTrack): Promise<SubtitleCue[]>
  /** Same-video-session reuse 判断 */
  shouldUseSameTrack(prev: RawTrack | null, next: RawTrack | null): boolean
}
```

每平台一个实现。Adapter 只依赖接口，不关心具体 API。

## Delivery — 4 stacked PRs

### PR M4.0 · SubtitleAdapter/Fetcher abstraction (refactor, zero-behavior-change)

**Scope:**
- 抽出 `SubtitleFetcher` 接口 + `PlatformFetcherRegistry`
- 把 YouTube 现有 `subtitlesFetcher` 改造成 `YoutubeFetcher implements SubtitleFetcher`
- `UniversalVideoAdapter` 通过 registry 查 fetcher（不直接 import youtube）
- 不加新平台；测试保证 YouTube 行为不变
- **验收**: YouTube 字幕翻译流程完全一致，测试全绿

~400-500 LOC，**纯重构**，PR 易过。

### PR M4.1 · Bilibili adapter

**Scope:**
- 新增 `platforms/bilibili.ts` + `init-bilibili-subtitles.ts`
- 新增 `utils/subtitles/fetchers/bilibili.ts`（用 `api.bilibili.com/x/player/v2`，走 background `proxyFetch` 以携带用户 cookie）
- `runtime.ts` 加 Bilibili 分派
- manifest host permission 加 `*://*.bilibili.com/*`
- 处理 Bilibili 特殊点：SPA 导航（`pushState` 监听 + 自定义事件）、登录态（未登录部分字幕可见，登录后更多）、BV 号 vs AV 号（两种 URL 格式都 match）
- E2E 冒烟：打开一个带 CC 的 Bilibili 视频，验证叠加字幕

### PR M4.2 · TED adapter

**Scope:**
- `platforms/ted.ts` + `init-ted-subtitles.ts`
- `fetchers/ted.ts`（`https://www.ted.com/talks/{slug}/transcript.json`，公开无需登录）
- manifest `*://*.ted.com/*`
- TED 特色：静态页面，没有 SPA 导航事件（简单）；transcript 是完整段落而非时间戳 cue，需要从视频 DOM 的 `textTracks` 拿时间轴 + merge
- 或者直接用 `<track>` 元素的 VTT（如果 TED 播放器暴露的话）

### PR M4.3 · X/Twitter adapter + i18n 收尾 + changeset

**Scope:**
- `platforms/x.ts` + `init-x-subtitles.ts`
- `fetchers/x.ts`（VTT from video.textTracks 或 HLS manifest）
- manifest `*://twitter.com/*, *://x.com/*`
- X 特色：短视频（大多数 < 2:20），推文嵌入视频（容器 DOM 跟 timeline 混在一起）
- i18n key 补齐 + Options 页面 metadata 加 3 个平台名（显示"支持的平台"时）
- changeset + 合入 main

## Risk + Mitigation

| 风险 | 缓解 |
|------|------|
| Bilibili 反爬 / API 变更 | `proxyFetch` 走 background 带 cookie + User-Agent；API 签名用公开包装器；版本化 fallback |
| TED transcript JSON 结构变化 | 用 schema 验证解析（zod），异常时 fallback 到 DOM 抓取 |
| X 视频 textTracks 不可用 | 对于没有 CC 的视频优雅降级（提示"无可翻译字幕"） |
| SPA 导航事件平台特定 | 每家独立 `init-*` 封装，失败时 fallback 到 `MutationObserver` 监听 URL 变化 |
| Shadow Root 挂载点选择器过时 | 所有 selector 集中在 `PlatformConfig`，易维护 |
| 平台检测误触发非播放页 | `PlatformConfig.urlPattern` 严格匹配 path（如 `/video/BV`）|

## Out of Scope → Future milestones

- **M4.5**: Udemy + Coursera（~1 周）
- **M4+1**: Netflix / Disney+ / Hulu DRM 支持（如果用户反馈强烈）
- **社区贡献**: `platforms/AGENTS.md` 写清楚贡献步骤，让 OSS 社区可以自己加平台

## Acceptance (M4 total)

- [ ] 4 PR 按序合入 main
- [ ] YouTube 字幕翻译无回归
- [ ] Bilibili + TED + X 至少 1 个热门视频字幕翻译可运行（手动冒烟）
- [ ] 每家有至少 1 个 fixture test（字幕解析）+ 1 个 adapter 单元测试
- [ ] `SKIP_FREE_API=true pnpm test && type-check && lint` 全绿
- [ ] i18n 8 locale 的新 UI string 覆盖
- [ ] 合计新增测试 ≥ 30

---

**下一步**: PR M4.0 的 `superpowers:writing-plans`（纯重构，最简单，快速定稿抽象层）。
