# Web 多语言支持 — 设计文档

> **状态**: 已确认，待实施
> **日期**: 2026-04-23

## 目标

`https://getutranslate.com/` 当前只有英文。首版网站多语言支持覆盖简体中文、繁体中文、英语，按用户浏览器语言自动进入合适版本，并允许用户手动切换且记住选择。

## 核心决策

| 决策 | 选择 | 理由 |
|------|------|------|
| URL 结构 | locale 前缀：`/en/`、`/zh-CN/`、`/zh-TW/` | 适合静态导出、SEO、分享链接和明确语言状态 |
| 语言记忆 | `localStorage` 记住网站语言 | 不依赖登录，不影响扩展配置 |
| 覆盖范围 | 全站现有页面 | 切换语言后体验一致，避免法律和付款页面掉回英文 |
| 法律页 | 中文/繁中完整翻译，并声明英文版优先 | 提供可读性，同时降低翻译差异造成的法律风险 |
| 选择器位置 | 顶部导航右侧，下拉选择 | 全站可见，符合常见网站习惯 |
| 实现方式 | 自建轻量 i18n 层 | 当前站点小，避免为少量页面引入重型 i18n 依赖 |

## 路由设计

真实页面迁移到 locale 前缀路由：

```text
/en/
/en/price/
/en/log-in/
/en/privacy/
/en/terms-and-conditions/
/en/refund/
/en/upgrade/success/

/zh-CN/...
/zh-TW/...
```

`apps/web/app/[locale]/...` 承载页面内容，通过 `generateStaticParams()` 生成三种语言版本，继续保持 `next.config.ts` 的 `output: "export"` 和 `trailingSlash: true`。

根路径 `/` 是静态语言入口页。客户端脚本按以下优先级跳转：

1. 用户手动选择过的语言：`localStorage["getu:web-locale"]`
2. 浏览器语言：`navigator.languages`
3. 兜底：`/en/`

如果脚本不可用，根路径显示极简 fallback，提供 `English`、`简体中文`、`繁體中文` 三个入口。

无效 locale 路径不生成静态页面，走现有 404。

## i18n 模块

新增 `apps/web/lib/i18n/`，保持实现小而明确：

- `locales.ts`
  - `SUPPORTED_LOCALES = ["en", "zh-CN", "zh-TW"]`
  - locale 标签与 `html lang` 值
  - 浏览器语言匹配规则
- `messages.ts` 或 `messages/*.ts`
  - common/nav/footer 文案
  - home、price、auth、upgrade success、privacy、terms、refund 文案
  - metadata title/description
- `routing.ts`
  - 生成 locale-aware href
  - 将当前路径切换到目标 locale 的同页路径
  - 无法映射时回到目标 locale 首页

页面组件不引入通用翻译函数 DSL。优先使用类型化 message 对象，例如 `messages.home.hero.title`，让 TypeScript 在缺字段时直接报错。

## 页面与组件

`SiteShell` 改为接收 `locale` 与 common messages，负责：

- 品牌链接指向当前 locale 首页
- 顶部导航和 footer 链接带 locale 前缀
- 顶部导航右侧显示语言下拉

语言选择器显示当前语言：

- `English`
- `简体中文`
- `繁體中文`

选择目标语言时：

1. 写入 `localStorage["getu:web-locale"] = targetLocale`
2. 把当前路径映射到目标 locale 的同一页面
3. 跳转到目标 URL

所有现有页面完成本地化：首页、价格、登录、升级成功、隐私、条款、退款。

法律页面中文和繁中版本增加英文优先说明：

> 本译文仅为方便阅读；如与英文版本不一致，以英文版本为准。

## 支付与认证路径

价格页创建 checkout session 时，`successUrl` 和 `cancelUrl` 使用当前 locale：

- `https://getutranslate.com/{locale}/upgrade/success/`
- `https://getutranslate.com/{locale}/price/`

这样用户从 Stripe 返回后仍停留在购买前选择的语言。

登录页社交登录 callback 也使用当前 locale 首页，避免登录后掉回英文根路径。

API 错误继续沿用当前客户端展示方式，但用户可见的默认错误文案进入 messages 字典。

## SEO 与元信息

每个 locale 页面生成本语言的：

- `title`
- `description`
- canonical URL
- `hreflang` alternates：`en`、`zh-CN`、`zh-TW`

目标是静态构建产物中每个语言页面都有清晰语言信号。实现时需要验证 Next static export 下 `html lang`、metadata 和 alternates 的实际输出。

英文是兜底语言。不做运行时机器翻译。

## 浏览器语言匹配规则

匹配规则按顺序扫描 `navigator.languages`：

| 浏览器语言 | 目标 locale |
|------------|-------------|
| `zh-CN`、`zh-SG`、`zh-Hans*`、`zh` | `zh-CN` |
| `zh-TW`、`zh-HK`、`zh-MO`、`zh-Hant*` | `zh-TW` |
| `en*` | `en` |
| 其他 | 继续扫描，最终兜底 `en` |

如果 `localStorage` 不可用，根路径只按浏览器语言判断。如果浏览器语言读取失败，跳 `/en/`。

## 测试与验证

新增 web i18n 单元测试，覆盖：

- supported locale 判断
- 浏览器语言到 locale 的匹配
- 当前路径切换到目标 locale 的映射
- 根路径默认目标选择逻辑

验证命令：

```bash
pnpm --filter @getu/web type-check
pnpm --filter @getu/web build
```

构建后抽查：

- `apps/web/out/en/`
- `apps/web/out/zh-CN/`
- `apps/web/out/zh-TW/`
- 各语言首页、价格页、法律页 HTML 中的标题、导航文案和 hreflang
- `/` fallback 页面包含三种语言入口

`apps/web` 当前 lint 脚本仍是 `web lint-todo`，不把 lint 当作本次强校验。

## 非目标

- 不同步到账户语言偏好
- 不改扩展内语言设置
- 不新增后台 API
- 不引入 CMS 或翻译管理平台
- 不做按国家或语言自动切换价格货币，价格仍以 USD 为准
- 不改变 Cloudflare Pages 的静态导出部署模型

## 实施切片

建议后续 implementation plan 拆成 3 个小 PR：

1. **路由与 i18n 基建**
   - 新增 `apps/web/lib/i18n/`
   - 迁移页面到 `[locale]` 路由
   - 根路径自动跳转与 fallback
   - locale-aware navigation
2. **全站文案本地化**
   - 添加 `en`、`zh-CN`、`zh-TW` messages
   - 覆盖首页、价格、登录、升级成功、隐私、条款、退款
   - 法律页加入英文优先说明
3. **SEO、支付回跳与验证**
   - metadata、canonical、hreflang
   - checkout 和 auth callback 使用当前 locale
   - 单元测试、type-check、build、静态产物抽查
