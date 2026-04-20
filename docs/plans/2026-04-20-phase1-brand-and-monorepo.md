# Phase 1 · Brand Rename + Monorepo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent roadmap:** `docs/plans/2026-04-20-getu-translate-roadmap.md` _(to be written after Phase 1 merges)_
> **Naming note:** This repo already uses "M0" for the upstream commercialization milestone (`.changeset/m0-*.md`, `docs/plans/2026-04-20-m0-commercialization.md`). To avoid collision, the GetU rewrite uses **Phase 1 / 2 / 3 / 4 / 5** — do not confuse with the upstream M0-M4.

**Goal:** Convert this fork into a pnpm monorepo under the **GetU Translate / 懂你翻译** brand, carrying no runtime dependencies on upstream `@read-frog/*` npm packages. Ready for independent backend work in Phase 2.

**Architecture:**

- pnpm workspace (`apps/*`, `packages/*`), Nx caching retained
- `apps/extension` — current WXT extension code, moved from repo root
- `apps/web` — Next.js 15 skeleton, deployed to Vercel later (Phase 2 fills auth pages)
- `apps/api` — Hono on Cloudflare Workers skeleton with `/health` only (Phase 2 fills oRPC)
- `packages/definitions` — forked from `@read-frog/definitions@0.1.2`, `READFROG_DOMAIN` → `GETU_DOMAIN`
- `packages/contract` — forked from `@read-frog/api-contract@0.2.2`, structure unchanged
- `packages/db` — empty placeholder (Phase 2 adds Drizzle schema)
- Brand strings: `readfrog` / `Read Frog` / `readfrog.app` → `getu-translate` / `GetU Translate` / `getutranslate.com`

**Tech Stack:** pnpm@10.32.1 workspaces · Nx (existing) · WXT (unchanged) · Next.js 15 · Hono 4 · Wrangler 3 · Vitest

**Out of scope (deferred to later phases):**

- Real auth / session / oRPC routes → Phase 2
- Neon Postgres + Drizzle schema → Phase 2
- AI Key proxy + quota → Phase 3
- Paddle / Stripe checkout → Phase 4
- Monitoring, backups, store re-submission → Phase 5
- New logo / icon artwork (blocked on design, not on this plan)

**Duration estimate:** 2 weeks, single person.

---

## Pre-flight reminders

- All destructive ops (GitHub repo rename, directory rename) live in **Task 0** and are **manual** — do not delegate to agent.
- Each Task ends with a commit. Push after the sequence or open PRs per task.
- `sed -i ''` syntax below is BSD (macOS) compatible. On Linux use `sed -i`.
- Before starting any task, ensure working tree is clean: `git status`.

---

## Task 0: Rename GitHub repo and local directory (MANUAL)

**Files:** None (infrastructure ops).

- [ ] **Step 1: Verify clean tree**

```bash
cd /Users/pengyu/workspace/app/read-frog
git status
```

Expected: `nothing to commit, working tree clean`. If not, commit/stash first.

- [ ] **Step 2: Rename on GitHub (manual)**

In GitHub web UI: Settings → General → Repository name: `read-frog` → `getu-translate`. Confirm rename.

- [ ] **Step 3: Rename local directory**

```bash
cd /Users/pengyu/workspace/app
mv read-frog getu-translate
cd getu-translate
```

- [ ] **Step 4: Update remote URL**

```bash
git remote set-url origin git@github.com:iannoying/getu-translate.git
git remote -v
```

Expected: both `fetch` and `push` URLs show `getu-translate.git`.

- [ ] **Step 5: Verify fetch works**

```bash
git fetch --prune
git log --oneline -3
```

Expected: commit log prints, no errors.

**No commit — this task modifies infrastructure only.**

---

## Task 1: pnpm workspace skeleton

Minimal scaffold. File move happens in Task 2.

**Files:**

- Create: `pnpm-workspace.yaml`
- Create: `apps/.gitkeep`, `packages/.gitkeep`

- [ ] **Step 1: Create workspace file**

```bash
cat > pnpm-workspace.yaml <<'EOF'
packages:
  - "apps/*"
  - "packages/*"
EOF
```

- [ ] **Step 2: Create directories**

```bash
mkdir -p apps packages
touch apps/.gitkeep packages/.gitkeep
```

- [ ] **Step 3: Verify install still works (root still hosts extension pkg)**

```bash
pnpm install
```

Expected: runs `postinstall` → `wxt prepare` succeeds; no "no projects matched filter" errors.

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml apps/.gitkeep packages/.gitkeep
git commit -m "chore(monorepo): add pnpm workspace config"
```

---

## Task 2: Move extension to `apps/extension/` (history-preserving)

**CRITICAL**: Use `git mv` so blame/log follow. Biggest task.

**Files moved (git mv):**

- `src/` → `apps/extension/src/`
- `public/` → `apps/extension/public/`
- `assets/` → `apps/extension/assets/`
- `scripts/` → `apps/extension/scripts/`
- `wxt.config.ts` → `apps/extension/wxt.config.ts`
- `vitest.config.ts` → `apps/extension/vitest.config.ts`
- `vitest.setup.ts` → `apps/extension/vitest.setup.ts`
- `postcss.config.cjs` → `apps/extension/postcss.config.cjs`
- `tsconfig.json` → `apps/extension/tsconfig.json`
- `components.json` → `apps/extension/components.json`
- `eslint.config.mjs` → `apps/extension/eslint.config.mjs`
- `package.json` → `apps/extension/package.json`

**Files created / modified:**

- Create: `package.json` (new workspace root)
- Modify: `nx.json` (add `workspaceLayout`)
- Modify: `apps/extension/package.json` (rename + strip root-level deps)
- Modify: `apps/extension/wxt.config.ts` (fix relative alias paths)

- [ ] **Step 1: Create target dir**

```bash
mkdir -p apps/extension
```

- [ ] **Step 2: Move source dirs**

```bash
git mv src apps/extension/src
git mv public apps/extension/public
git mv assets apps/extension/assets
git mv scripts apps/extension/scripts
```

- [ ] **Step 3: Move config files**

```bash
git mv wxt.config.ts apps/extension/wxt.config.ts
git mv vitest.config.ts apps/extension/vitest.config.ts
git mv vitest.setup.ts apps/extension/vitest.setup.ts
git mv postcss.config.cjs apps/extension/postcss.config.cjs
git mv tsconfig.json apps/extension/tsconfig.json
git mv components.json apps/extension/components.json
git mv eslint.config.mjs apps/extension/eslint.config.mjs
```

- [ ] **Step 4: Move package.json**

```bash
git mv package.json apps/extension/package.json
```

- [ ] **Step 5: Rename pkg + strip husky/commitlint from extension package.json**

Edit `apps/extension/package.json`:

```diff
-  "name": "@read-frog/extension",
+  "name": "@getu/extension",
```

In the same file, **delete** these keys (they move to the new root):

- `"prepare": "husky"` script line
- `"husky": "..."` from devDependencies
- `"@commitlint/cli": "..."` from devDependencies
- `"@commitlint/config-conventional": "..."` from devDependencies

Extract their exact version strings first — you'll paste them into root `package.json` in Step 6.

- [ ] **Step 6: Create new root `package.json`**

Replace `<husky-ver>`, `<commitlint-cli-ver>`, `<commitlint-config-ver>` with versions copied in Step 5.

```json
{
  "name": "getu-translate",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.32.1",
  "description": "GetU Translate monorepo (extension + web + api)",
  "scripts": {
    "build": "pnpm -r --parallel build",
    "dev": "pnpm --filter @getu/extension dev",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "type-check": "pnpm -r type-check",
    "prepare": "husky"
  },
  "devDependencies": {
    "husky": "<husky-ver>",
    "@commitlint/cli": "<commitlint-cli-ver>",
    "@commitlint/config-conventional": "<commitlint-config-ver>"
  }
}
```

Leave `.husky/` dir and `commitlint.config.cjs` at repo root (already are).

- [ ] **Step 7: Update `nx.json` with workspace layout**

Edit `nx.json`, add `workspaceLayout` right after `$schema`:

```diff
 {
   "$schema": "./node_modules/nx/schemas/nx-schema.json",
+  "workspaceLayout": {
+    "appsDir": "apps",
+    "libsDir": "packages"
+  },
   "targetDefaults": { ... unchanged ... }
 }
```

- [ ] **Step 8: Fix wxt.config.ts alias depth**

The alias referenced `../read-frog-monorepo/packages/definitions/src` assuming extension at repo root. Now it sits two levels deeper.

Edit `apps/extension/wxt.config.ts:17-22`:

```diff
   alias: process.env.WXT_USE_LOCAL_PACKAGES === "true"
     ? {
-        "@read-frog/definitions": path.resolve(__dirname, "../read-frog-monorepo/packages/definitions/src"),
-        "@read-frog/api-contract": path.resolve(__dirname, "../read-frog-monorepo/packages/api-contract/src"),
+        "@read-frog/definitions": path.resolve(__dirname, "../../../read-frog-monorepo/packages/definitions/src"),
+        "@read-frog/api-contract": path.resolve(__dirname, "../../../read-frog-monorepo/packages/api-contract/src"),
       }
     : {},
```

(This block is removed entirely in Task 4.)

- [ ] **Step 9: Install — pnpm creates extension-scoped node_modules**

```bash
pnpm install
```

Expected: no errors; both root and `apps/extension/node_modules` populated.

- [ ] **Step 10: Verify extension build**

```bash
pnpm --filter @getu/extension build
```

Expected: produces `apps/extension/.output/chrome-mv3/manifest.json`. Zero errors.

- [ ] **Step 11: Verify extension tests**

```bash
pnpm --filter @getu/extension test
```

Expected: same number of passing tests as before the move. Zero failures.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor(monorepo): move extension to apps/extension"
```

---

## Task 3: Fork `@read-frog/definitions` → `packages/definitions`

Source of `@read-frog/definitions@0.1.2` lives in the upstream monorepo. We clone it once, copy the source in, then disconnect.

**Files:**

- Create: `packages/definitions/package.json`
- Create: `packages/definitions/tsconfig.json`
- Create: `packages/definitions/src/**` (copied from upstream)
- Modify: `apps/extension/package.json` (swap dep)
- Modify: 50+ extension source files (import path rewrite)
- Modify: `apps/extension/wxt.config.ts` (strip definitions alias)

- [ ] **Step 1: Clone upstream monorepo (one-time fetch of source)**

```bash
cd /Users/pengyu/workspace/app
if [ ! -d read-frog-monorepo ]; then
  gh repo clone mengxi-ream/read-frog-monorepo
fi
ls read-frog-monorepo/packages/definitions/src
```

Expected: directory listing of `.ts` files (e.g. `index.ts`, `lang-codes.ts`, `schemas.ts`, `url.ts`).

If upstream is private or clone fails: fall back to copying from `node_modules/@read-frog/definitions/dist` (compiled `.js` + `.d.ts`). The `.d.ts` is adequate for types but costs you hand-porting runtime exports.

- [ ] **Step 2: Copy source**

```bash
cd /Users/pengyu/workspace/app/getu-translate
mkdir -p packages/definitions/src
cp -R /Users/pengyu/workspace/app/read-frog-monorepo/packages/definitions/src/* packages/definitions/src/

# Copy tsconfig if present, else create minimal one in Step 4
cp /Users/pengyu/workspace/app/read-frog-monorepo/packages/definitions/tsconfig.json packages/definitions/tsconfig.json 2>/dev/null || true
```

- [ ] **Step 3: Create `packages/definitions/package.json`**

Verify zod version used by extension:

```bash
grep '"zod"' apps/extension/package.json
```

Then create `packages/definitions/package.json` using the **same** zod version (replace `<zod-ver>`):

```json
{
  "name": "@getu/definitions",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "zod": "<zod-ver>"
  }
}
```

- [ ] **Step 4: Create minimal tsconfig if not copied**

`packages/definitions/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Rebrand URL constants**

Find which source file defines `READFROG_DOMAIN`:

```bash
grep -rn "READFROG_DOMAIN\|WEBSITE_PROD_URL" packages/definitions/src/
```

Edit that file (likely `packages/definitions/src/url.ts` or similar):

```diff
-export const READFROG_DOMAIN = "readfrog.app"
-export const WEBSITE_PROD_URL = "https://readfrog.app"
-export const WEBSITE_CADDY_DEV_URL = "https://dev.readfrog.app"
+export const GETU_DOMAIN = "getutranslate.com"
+export const WEBSITE_PROD_URL = "https://getutranslate.com"
+export const WEBSITE_CADDY_DEV_URL = "http://localhost:8788"
```

Also rebrand any auth domain arrays in the same folder:

```bash
grep -rn "readfrog" packages/definitions/src/
```

For each hit, replace `readfrog.app` → `getutranslate.com`. Leave `localhost` entries.

- [ ] **Step 6: Swap extension dependency**

Edit `apps/extension/package.json`:

```diff
-    "@read-frog/definitions": "0.1.2",
+    "@getu/definitions": "workspace:*",
```

- [ ] **Step 7: Rewrite imports across extension**

```bash
cd apps/extension
grep -rl "@read-frog/definitions" src/ | xargs sed -i '' 's|@read-frog/definitions|@getu/definitions|g'
grep -rl "READFROG_DOMAIN" src/ | xargs sed -i '' 's|READFROG_DOMAIN|GETU_DOMAIN|g'
```

Verify:

```bash
grep -rn "@read-frog/definitions\|READFROG_DOMAIN" src/
```

Expected: zero output.

- [ ] **Step 8: Strip definitions alias from wxt.config.ts**

Edit `apps/extension/wxt.config.ts`:

```diff
   alias: process.env.WXT_USE_LOCAL_PACKAGES === "true"
     ? {
-        "@read-frog/definitions": path.resolve(__dirname, "../../../read-frog-monorepo/packages/definitions/src"),
         "@read-frog/api-contract": path.resolve(__dirname, "../../../read-frog-monorepo/packages/api-contract/src"),
       }
     : {},
```

- [ ] **Step 9: Install + verify**

```bash
cd /Users/pengyu/workspace/app/getu-translate
pnpm install
pnpm --filter @getu/extension type-check
pnpm --filter @getu/extension test
pnpm --filter @getu/extension build
```

Expected: all four commands exit 0. Type-check is the strict signal — any missed import errors here.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(monorepo): fork @read-frog/definitions as @getu/definitions"
```

---

## Task 4: Fork `@read-frog/api-contract` → `packages/contract`

Mirror of Task 3; 3 import sites + 1 test file.

**Files:**

- Create: `packages/contract/package.json`, `tsconfig.json`, `src/**`
- Modify: `apps/extension/package.json` (swap dep)
- Modify: `apps/extension/src/utils/notebase.ts`
- Modify: `apps/extension/src/utils/orpc/client.ts`
- Modify: `apps/extension/src/utils/__tests__/notebase.test.ts`
- Modify: `apps/extension/src/entrypoints/options/pages/custom-actions/action-config-form/notebase-connection-field.tsx`
- Modify: `apps/extension/wxt.config.ts` (strip full alias block)

- [ ] **Step 1: Copy source**

```bash
mkdir -p packages/contract/src
cp -R /Users/pengyu/workspace/app/read-frog-monorepo/packages/api-contract/src/* packages/contract/src/
cp /Users/pengyu/workspace/app/read-frog-monorepo/packages/api-contract/tsconfig.json packages/contract/tsconfig.json 2>/dev/null || true
```

- [ ] **Step 2: Inspect upstream api-contract deps**

```bash
cat /Users/pengyu/workspace/app/read-frog-monorepo/packages/api-contract/package.json
```

Note the `@orpc/*` versions and any `zod` version.

- [ ] **Step 3: Create `packages/contract/package.json`** (fill in versions from Step 2)

```json
{
  "name": "@getu/contract",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "zod": "<zod-ver>",
    "@orpc/client": "<orpc-client-ver>",
    "@orpc/contract": "<orpc-contract-ver>"
  }
}
```

- [ ] **Step 4: Create `packages/contract/tsconfig.json`** (same as definitions if not already copied)

- [ ] **Step 5: Swap extension dependency**

Edit `apps/extension/package.json`:

```diff
-    "@read-frog/api-contract": "0.2.2",
+    "@getu/contract": "workspace:*",
```

- [ ] **Step 6: Rewrite imports**

```bash
cd apps/extension
grep -rl "@read-frog/api-contract" src/ | xargs sed -i '' 's|@read-frog/api-contract|@getu/contract|g'
```

Verify:

```bash
grep -rn "@read-frog" src/
```

Expected: zero.

- [ ] **Step 7: Remove remaining alias block from wxt.config.ts**

Edit `apps/extension/wxt.config.ts`:

```diff
-  alias: process.env.WXT_USE_LOCAL_PACKAGES === "true"
-    ? {
-        "@read-frog/api-contract": path.resolve(__dirname, "../../../read-frog-monorepo/packages/api-contract/src"),
-      }
-    : {},
+  // Upstream aliases removed — all @read-frog/* packages forked into ../../packages/*
```

- [ ] **Step 8: Install + verify**

```bash
cd /Users/pengyu/workspace/app/getu-translate
pnpm install
pnpm --filter @getu/extension type-check
pnpm --filter @getu/extension test
pnpm --filter @getu/extension build
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(monorepo): fork @read-frog/api-contract as @getu/contract"
```

---

## Task 5: Brand rename — user-visible strings

**Files:**

- Modify: `apps/extension/src/locales/*.yml` (14 locale files)
- Modify: `apps/extension/src/entrypoints/options/app-sidebar/index.tsx` (line 32)
- Modify: `apps/extension/src/entrypoints/popup/components/more-menu.tsx` (line 75)
- Modify: `apps/extension/src/components/api-config-warning.tsx` (line 16)
- Modify: `apps/extension/src/utils/blog.ts` (line 163)
- Modify: `apps/extension/src/utils/__tests__/blog.test.ts` (lines 172, 176)
- Modify: `apps/extension/src/entrypoints/popup/components/__tests__/blog-notification.test.tsx` (line 109)
- Modify: `apps/extension/src/entrypoints/options/app-sidebar/__tests__/whats-new-footer.test.tsx` (line 201)
- Modify: `apps/extension/package.json` (description)

**Do NOT modify:**

- `CHANGELOG.md`, `.changeset/*.md` (historical records)
- `pnpm-lock.yaml` (auto-regenerated)

- [ ] **Step 1: Rename `extName` / `extDescription` per locale (manual, language-aware)**

Native-speaker pass, one file at a time. Example targets:

| File                         | `extName`        | `extDescription` (example)                       |
| ---------------------------- | ---------------- | ------------------------------------------------ |
| `en.yml`                     | `GetU Translate` | `Understand any webpage in your native language` |
| `zh-CN.yml`                  | `懂你翻译`       | `理解任何网页 —— 用你的母语`                     |
| `zh-TW.yml`                  | `懂你翻譯`       | `理解任何網頁 —— 用你的母語`                     |
| `ja.yml`                     | `GetU 翻訳`      | Keep Latin brand, re-translate tagline           |
| `ko.yml`                     | `GetU 번역`      | 동일                                             |
| `ru.yml`, `tr.yml`, `vi.yml` | `GetU Translate` | Re-translate tagline                             |

Use `Edit` tool per key, not `sed`. `extName` appears in `_locales/<lang>/messages.json` at build time but lives in these YAML sources.

- [ ] **Step 2: Replace `readfrog.app` strings in locales (mechanical)**

```bash
cd apps/extension/src/locales
for f in *.yml; do
  sed -i '' 's|readfrog\.app|getutranslate.com|g' "$f"
done
grep -n "readfrog" *.yml
```

Expected: final `grep` prints nothing.

- [ ] **Step 3: Replace 4 hard-coded URLs in components**

`apps/extension/src/entrypoints/options/app-sidebar/index.tsx:32`:

```diff
-        <a href="https://readfrog.app" className="flex items-center gap-2">
+        <a href="https://getutranslate.com" className="flex items-center gap-2">
```

`apps/extension/src/entrypoints/popup/components/more-menu.tsx:75`:

```diff
-          onClick={() => window.open("https://readfrog.app/tutorial/", "_blank", "noopener,noreferrer")}
+          onClick={() => window.open("https://getutranslate.com/tutorial/", "_blank", "noopener,noreferrer")}
```

`apps/extension/src/components/api-config-warning.tsx:16`:

```diff
-        href="https://readfrog.app/tutorial/api-key"
+        href="https://getutranslate.com/tutorial/api-key"
```

`apps/extension/src/utils/blog.ts:163`:

```diff
-  apiUrl: string = "https://readfrog.app/api/blog/latest",
+  apiUrl: string = "https://getutranslate.com/api/blog/latest",
```

- [ ] **Step 4: Fix test fixtures that reference the URL**

For each of the test files listed in "Files" above, replace `readfrog.app` → `getutranslate.com` (keep `www.` prefix pattern if present).

`apps/extension/src/utils/__tests__/blog.test.ts:172`:

```diff
-    expect(buildBilibiliEmbedUrl("https://readfrog.app/blog")).toBeNull()
+    expect(buildBilibiliEmbedUrl("https://getutranslate.com/blog")).toBeNull()
```

Same pattern for the other three hit sites.

- [ ] **Step 5: Update extension package.json description**

Edit `apps/extension/package.json`:

```diff
-  "description": "Read Frog browser extension for language learning",
+  "description": "GetU Translate browser extension for language learning",
```

- [ ] **Step 6: Verify**

```bash
pnpm --filter @getu/extension test
pnpm --filter @getu/extension type-check
pnpm --filter @getu/extension build
```

Expected: all pass. Now `grep -rn "readfrog" apps/extension/src/` should return zero matches (CHANGELOG/lockfile excluded because they're above src/).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(brand): rename user-visible strings to GetU Translate"
```

---

## Task 6: README restructure + attribution

**Files:**

- Move: `README.md` → `apps/extension/README.md` (rebrand)
- Move: `README.zh-CN.md` → `apps/extension/README.zh-CN.md` (rebrand)
- Create: new `README.md` at repo root (monorepo overview)

- [ ] **Step 1: Move existing READMEs**

```bash
git mv README.md apps/extension/README.md
git mv README.zh-CN.md apps/extension/README.zh-CN.md
```

- [ ] **Step 2: Rebrand extension READMEs**

In `apps/extension/README.md`, globally replace `Read Frog` → `GetU Translate` and `readfrog.app` → `getutranslate.com`. Keep upstream attribution visible; add near the top:

```markdown
> This extension is a fork of [mengxi-ream/read-frog](https://github.com/mengxi-ream/read-frog), maintained independently as **GetU Translate** under GPL-3.0. The original project remains the upstream.
```

Repeat for `apps/extension/README.zh-CN.md` with a Chinese version of the same line.

- [ ] **Step 3: Create new root README**

Create `README.md`:

````markdown
# GetU Translate · 懂你翻译

Cross-platform translation & language-learning toolkit. Monorepo for the browser extension, web site, and backend API.

## Layout

- `apps/extension/` — browser extension (Chrome / Edge / Firefox MV3), WXT + React
- `apps/web/` — Next.js 15 site: login, pricing, account (Vercel)
- `apps/api/` — Hono on Cloudflare Workers: auth, oRPC, Stripe/Paddle webhooks
- `packages/definitions/` — shared domain constants (language codes, URL bases)
- `packages/contract/` — oRPC procedure contracts shared extension ↔ api
- `packages/db/` — Drizzle schema + migrations (Phase 2)

## Quickstart

```bash
corepack enable
pnpm install
pnpm --filter @getu/extension dev   # opens Chrome with the extension loaded
pnpm --filter @getu/web dev         # Next.js on :3000
pnpm --filter @getu/api dev         # Wrangler on :8788
````

## License

GPL-3.0. Forked from [mengxi-ream/read-frog](https://github.com/mengxi-ream/read-frog).

````

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs(readme): restructure for monorepo + rebrand with attribution"
````

---

## Task 7: Scaffold `apps/web` (Next.js 15 placeholder)

Minimal — Phase 2 fills auth/pricing.

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/log-in/page.tsx`
- Create: `apps/web/.gitignore`

- [ ] **Step 1: `apps/web/package.json`**

```json
{
  "name": "@getu/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.1.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2"
  }
}
```

- [ ] **Step 2: `apps/web/next.config.ts`**

```ts
import type { NextConfig } from "next"

const config: NextConfig = {
  reactStrictMode: true,
}

export default config
```

- [ ] **Step 3: `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: `apps/web/next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 5: `apps/web/app/layout.tsx`**

```tsx
export const metadata = {
  title: "GetU Translate",
  description: "懂你翻译 — understand any webpage in your native language",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 6: `apps/web/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>GetU Translate</h1>
      <p>懂你翻译 — monorepo scaffold ready. Phase 2 wires up auth.</p>
    </main>
  )
}
```

- [ ] **Step 7: `apps/web/app/log-in/page.tsx`**

```tsx
export default function LogInPage() {
  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>Log In</h1>
      <p>Auth UI arrives in Phase 2.</p>
    </main>
  )
}
```

- [ ] **Step 8: `apps/web/.gitignore`**

```
.next
node_modules
.env.local
```

- [ ] **Step 9: Install + smoke check**

```bash
cd /Users/pengyu/workspace/app/getu-translate
pnpm install
pnpm --filter @getu/web dev &
DEV_PID=$!
sleep 6
curl -s http://localhost:3000 | grep -c "GetU Translate"
curl -s http://localhost:3000/log-in | grep -c "Log In"
kill $DEV_PID
```

Expected: both `grep -c` print `1` (or higher).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(web): scaffold Next.js 15 app with placeholder pages"
```

---

## Task 8: Scaffold `apps/api` (Hono on CF Workers)

TDD — test first, then implement.

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/wrangler.toml`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/__tests__/health.test.ts`
- Create: `apps/api/.gitignore`

- [ ] **Step 1: `apps/api/package.json`**

```json
{
  "name": "@getu/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "build": "wrangler deploy --dry-run --outdir dist",
    "test": "vitest run",
    "lint": "echo 'lint-todo'",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.6.14"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241224.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8",
    "wrangler": "^3.99.0"
  }
}
```

- [ ] **Step 2: `apps/api/wrangler.toml`**

```toml
name = "getu-api"
main = "src/index.ts"
compatibility_date = "2026-04-20"
compatibility_flags = ["nodejs_compat"]

[dev]
port = 8788
```

- [ ] **Step 3: `apps/api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["esnext"],
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Write failing test**

`apps/api/src/__tests__/health.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import app from "../index"

describe("health endpoint", () => {
  it("returns {ok: true, service: 'getu-api'}", async () => {
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, service: "getu-api" })
  })
})
```

- [ ] **Step 5: Install + run test → expect FAIL**

```bash
pnpm install
pnpm --filter @getu/api test
```

Expected: FAIL with `Cannot find module '../index'`.

- [ ] **Step 6: Minimal implementation**

`apps/api/src/index.ts`:

```ts
import { Hono } from "hono"

const app = new Hono()

app.get("/health", c => c.json({ ok: true, service: "getu-api" }))

export default app
```

- [ ] **Step 7: Run test → expect PASS**

```bash
pnpm --filter @getu/api test
```

Expected: `1 passed`.

- [ ] **Step 8: Smoke test via wrangler dev**

```bash
pnpm --filter @getu/api dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:8788/health
kill $DEV_PID
```

Expected: `{"ok":true,"service":"getu-api"}`.

- [ ] **Step 9: `.gitignore`**

`apps/api/.gitignore`:

```
node_modules
dist
.wrangler
.dev.vars
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(api): scaffold Hono on CF Workers with health endpoint (TDD)"
```

---

## Task 9: Placeholder `packages/db`

**Files:**

- Create: `packages/db/package.json`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/README.md`

- [ ] **Step 1: Package files**

`packages/db/package.json`:

```json
{
  "name": "@getu/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

`packages/db/src/index.ts`:

```ts
export const PHASE = "phase-1-placeholder" as const
```

`packages/db/README.md`:

```markdown
# @getu/db

Phase 2 will add Drizzle schema + Neon Postgres helpers.
```

- [ ] **Step 2: Install + full workspace type-check**

```bash
pnpm install
pnpm -r type-check
```

Expected: every workspace passes.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(db): add placeholder @getu/db package for Phase 2"
```

---

## Task 10: Update CI workflows for monorepo paths

**Files to inspect:**

- `.github/workflows/pr-test.yml`
- `.github/workflows/submit.yml`
- `.github/workflows/release.yml`
- `.github/workflows/changeset-major-warning.yml`
- `.github/workflows/refresh-agents-md.yml`
- `.github/workflows/lint-pr.yml`
- `.github/workflows/pr-contributor-trust.yml`
- `.github/workflows/stale-issue-pr.yml`
- `.github/workflows/claude.yml`

- [ ] **Step 1: Identify affected workflows**

```bash
grep -l "pnpm test\|pnpm build\|pnpm type-check\|pnpm lint\|./src/\|working-directory" .github/workflows/*.yml
```

- [ ] **Step 2: Patch pattern for extension-specific steps**

Replace in each affected file:

```diff
-      - run: pnpm test
+      - run: pnpm --filter @getu/extension test
-      - run: pnpm type-check
+      - run: pnpm --filter @getu/extension type-check
-      - run: pnpm build
+      - run: pnpm --filter @getu/extension build
-      - run: pnpm lint
+      - run: pnpm --filter @getu/extension lint
```

For `submit.yml` zip step:

```diff
-      - run: pnpm zip
+      - run: pnpm --filter @getu/extension zip
```

Artifact upload paths:

```diff
-          path: .output/*.zip
+          path: apps/extension/.output/*.zip
```

- [ ] **Step 3: Basic YAML + action validation**

```bash
for f in .github/workflows/*.yml; do
  python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "OK $f" || echo "BAD $f"
done
```

Expected: all `OK`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "ci: update workflow paths for monorepo structure"
```

---

## Task 11: Infra account setup checklist + env templates (manual)

No code; documents which external accounts / secrets Phase 2 will need.

**Files:**

- Create: `docs/infra/README.md`
- Create: `apps/api/.env.local.example`
- Create: `apps/web/.env.local.example`

- [ ] **Step 1: `docs/infra/README.md`**

```markdown
# GetU Translate — Infrastructure checklist

## Cloudflare

- Domain: `getutranslate.com` (registered via Cloudflare Registrar — confirmed 2026-04-20)
- Workers subdomain: `*.iannoying.workers.dev` (to be routed via `api.getutranslate.com` in Phase 2)
- DNS: set up in Phase 2 (A / CNAME for `api.getutranslate.com`, `www`, `@`)

## Vercel

- Project: `getu-web` (links `apps/web`)
- Root directory: `apps/web`
- Build command: `pnpm --filter @getu/web build`
- Install command: `pnpm install`
- Production domain: `getutranslate.com` (moved from CF → Vercel or kept on CF with proxy)
- Decision pending: where `www` root sits — Vercel or CF Pages.

## Neon Postgres

- Project: `getu-translate`
- Default branch: `main`
- Connection string stored in Vercel env + CF Workers secrets as `DATABASE_URL`.

## PostHog

- Reuse existing project if available, else new `getu-translate` project.
```

- [ ] **Step 2: `apps/api/.env.local.example`**

```bash
# Copy to .env.local (gitignored)
DATABASE_URL="postgresql://user:pass@ep-xxxx.neon.tech/getu?sslmode=require"
AUTH_SECRET="<openssl rand -base64 32>"
POSTHOG_API_KEY="phc_..."
```

- [ ] **Step 3: `apps/web/.env.local.example`**

```bash
NEXT_PUBLIC_API_BASE_URL="http://localhost:8788"
NEXT_PUBLIC_POSTHOG_KEY="phc_..."
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs(infra): add account setup checklist and env templates"
```

---

## Phase 1 Acceptance Criteria

All must pass before marking Phase 1 done:

- [ ] `pnpm install` from repo root succeeds with no resolution errors
- [ ] `pnpm --filter @getu/extension build` produces `apps/extension/.output/chrome-mv3/` loadable in Chrome's `chrome://extensions`
- [ ] `pnpm --filter @getu/extension test` passes same number of tests as pre-move (spot-check count)
- [ ] `pnpm --filter @getu/extension type-check` passes
- [ ] `pnpm --filter @getu/web dev` serves `GetU Translate` heading at `http://localhost:3000`
- [ ] `pnpm --filter @getu/api dev` (wrangler) returns `{"ok":true,"service":"getu-api"}` at `http://localhost:8788/health`
- [ ] `pnpm -r type-check` green across all workspaces
- [ ] `grep -rn "@read-frog/" apps/ packages/` returns **zero** matches in source
- [ ] `grep -rn "readfrog\.app" apps/` returns **zero** in `src/`; acceptable in `CHANGELOG.md` only
- [ ] `grep -rn "Read Frog\|ReadFrog" apps/extension/src/ apps/extension/public/` returns **zero**; acceptable in README attribution line
- [ ] GitHub repo is `iannoying/getu-translate`
- [ ] `.changeset/phase-1-monorepo.md` added describing the rename (let release tooling know)

---

## Dependency graph

```
Task 0 (rename) ─────────┐
                         ▼
Task 1 (workspace) ──▶ Task 2 (move) ──┬──▶ Task 3 (definitions)
                                       └──▶ Task 4 (contract)
                                                  │
                                                  ▼
                                             Task 5 (brand)
                                                  │
                                                  ▼
                                             Task 6 (READMEs)

Task 7 (web)    ─── parallel with 5,6 (after Task 1)
Task 8 (api)    ─── parallel with 5,6 (after Task 1)
Task 9 (db)     ─── parallel (after Task 1)
Task 10 (CI)    ─── after Task 2
Task 11 (infra) ─── anytime
```

**Critical path:** 0 → 1 → 2 → 3 → 4 → 5 → 6 (≈ 1.5 weeks)
**Parallelizable:** 7, 8, 9, 10, 11 (≈ half week when interleaved)

---

## Risks + mitigations

| Risk                                                                           | Mitigation                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream `read-frog-monorepo` source drifted from published 0.1.2 / 0.2.2 tags | Task 3/4 Step 1 falls back to copying from `node_modules/@read-frog/*/dist` (compiled `.js` + `.d.ts`). Good enough to run, needs hand-porting for source fidelity. |
| Nx cache poisoned after move                                                   | `rm -rf .nx node_modules/.cache/nx` and re-run. Acceptable one-time cost.                                                                                           |
| Husky hook paths break after moving `package.json`                             | Root-level husky install is explicit in Task 2 Step 6. Test by `git commit --allow-empty` after Task 2.                                                             |
| Native-speaker locales garbled by sed                                          | Task 5 Step 1 uses per-file `Edit`, not `sed`. Step 2 only touches domain strings via `sed`.                                                                        |
| Contract package `@orpc/*` versions mismatch upstream                          | Task 4 Step 2 reads upstream `package.json` and pins to same versions.                                                                                              |
| Commits too big to review                                                      | Each Task = one commit = one PR. Stack PRs (e.g. `git ci-status` or via `gh pr create --base <prev>`) so reviewers see incremental diffs.                           |
| GPL-3 obligations unclear                                                      | Root README and extension README both explicitly retain GPL + upstream attribution (Task 6 Step 2, Step 3). Do not delete these lines.                              |

---

## Next steps after Phase 1 merges

- Write `docs/plans/<date>-phase2-auth-free-tier.md`: better-auth Server on Workers + Drizzle schema in `@getu/db` + `billing.getEntitlements` returning Free + Next.js `/log-in` page wired.
- DNS cutover: `api.getutranslate.com` → CF Worker; `www.getutranslate.com` → Vercel.
- Chrome Web Store: reserve new listing under GetU Translate brand (don't publish until Phase 2).
