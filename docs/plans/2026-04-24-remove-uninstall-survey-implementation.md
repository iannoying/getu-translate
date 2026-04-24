# Remove Uninstall Survey Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the browser-extension uninstall redirect so uninstalling GetU Translate opens no page.

**Architecture:** The extension currently registers an uninstall URL during background startup. The implementation removes that registration path entirely: no import, no startup call, no uninstall-survey module, and no locale key carrying the Tally URL. Existing install/update behavior and the separate options-page Survey link remain unchanged.

**Tech Stack:** WXT MV3 background service worker, WebExtension `browser.runtime`, `@wxt-dev/i18n` YAML locale catalogs, TypeScript.

---

## File Structure

- Modify: `apps/extension/src/entrypoints/background/index.ts`
  - Remove the `setupUninstallSurvey` import and startup call.
- Delete: `apps/extension/src/entrypoints/background/uninstall-survey.ts`
  - Remove unused helper code that built the Tally URL and called `browser.runtime.setUninstallURL()`.
- Modify: `apps/extension/src/locales/en.yml`
  - Remove `uninstallSurveyUrl`.
- Modify: `apps/extension/src/locales/zh-CN.yml`
  - Remove `uninstallSurveyUrl`.
- Modify: `apps/extension/src/locales/zh-TW.yml`
  - Remove `uninstallSurveyUrl`.
- Modify: `apps/extension/src/locales/ja.yml`
  - Remove `uninstallSurveyUrl`.
- Modify: `apps/extension/src/locales/ko.yml`
  - Remove `uninstallSurveyUrl`.
- Modify: `apps/extension/src/locales/ru.yml`
  - Remove `uninstallSurveyUrl`.
- Modify: `apps/extension/src/locales/tr.yml`
  - Remove `uninstallSurveyUrl`.
- Modify: `apps/extension/src/locales/vi.yml`
  - Remove `uninstallSurveyUrl`.
- Modify: `apps/extension/src/entrypoints/background/AGENTS.md`
  - Remove documentation that says background startup registers the uninstall survey URL.
- Modify: `apps/extension/src/locales/AGENTS.md`
  - Remove documentation for the deleted locale key.

## Task 1: Remove Uninstall Redirect Registration

**Files:**
- Modify: `apps/extension/src/entrypoints/background/index.ts`
- Delete: `apps/extension/src/entrypoints/background/uninstall-survey.ts`
- Modify: `apps/extension/src/locales/en.yml`
- Modify: `apps/extension/src/locales/zh-CN.yml`
- Modify: `apps/extension/src/locales/zh-TW.yml`
- Modify: `apps/extension/src/locales/ja.yml`
- Modify: `apps/extension/src/locales/ko.yml`
- Modify: `apps/extension/src/locales/ru.yml`
- Modify: `apps/extension/src/locales/tr.yml`
- Modify: `apps/extension/src/locales/vi.yml`
- Modify: `apps/extension/src/entrypoints/background/AGENTS.md`
- Modify: `apps/extension/src/locales/AGENTS.md`

- [ ] **Step 1: Capture current uninstall redirect references**

Run:

```bash
rg -n "setUninstallURL|setupUninstallSurvey|uninstallSurveyUrl|tally\\.so/r/(nPK6Ob|3E9XDL)" apps/extension/src
```

Expected: matches in `background/index.ts`, `background/uninstall-survey.ts`, all locale YAML files, `background/AGENTS.md`, and `locales/AGENTS.md`. The options-page survey URL `https://tally.so/r/kdNN5R` is not part of this search and must remain unchanged.

- [ ] **Step 2: Remove background import and startup call**

In `apps/extension/src/entrypoints/background/index.ts`, remove this import:

```ts
import { setupUninstallSurvey } from "./uninstall-survey"
```

In the same file, remove this startup call:

```ts
    void setupUninstallSurvey()
```

No replacement code is needed. The background service worker should continue calling `newUserGuide()`, analytics setup, queues, config backup, proxy fetch, TTS handlers, iframe injection, and PDF redirect exactly as before.

- [ ] **Step 3: Delete the uninstall survey module**

Delete `apps/extension/src/entrypoints/background/uninstall-survey.ts` completely. This removes the helper functions for browser version detection, OS detection, locale detection, URL query construction, and the `browser.runtime.setUninstallURL()` call.

- [ ] **Step 4: Remove uninstall locale keys**

In each locale YAML file, remove the top-level `uninstallSurveyUrl` line:

```yaml
uninstallSurveyUrl: https://tally.so/r/nPK6Ob
```

Remove that exact line from:

```text
apps/extension/src/locales/en.yml
apps/extension/src/locales/ja.yml
apps/extension/src/locales/ko.yml
apps/extension/src/locales/ru.yml
apps/extension/src/locales/tr.yml
apps/extension/src/locales/vi.yml
```

In the Chinese locale files, remove the top-level line:

```yaml
uninstallSurveyUrl: https://tally.so/r/3E9XDL
```

Remove that exact line from:

```text
apps/extension/src/locales/zh-CN.yml
apps/extension/src/locales/zh-TW.yml
```

- [ ] **Step 5: Update local documentation**

In `apps/extension/src/entrypoints/background/AGENTS.md`, replace the sentence fragment:

```text
and the install/update flow (open tutorial, clear blog cache, register uninstall survey URL).
```

with:

```text
and the install/update flow (open tutorial, clear blog cache).
```

In the same file, remove the table row for `uninstall-survey.ts`:

```markdown
| `uninstall-survey.ts`       | Builds a per-user uninstall URL with version/browser/os/locale query params and calls `runtime.setUninstallURL`.                                                                                                                                      |
```

In `apps/extension/src/locales/AGENTS.md`, remove this bullet:

```markdown
- `uninstallSurveyUrl` — non-translated URL
```

- [ ] **Step 6: Verify removed references**

Run:

```bash
rg -n "setUninstallURL|setupUninstallSurvey|uninstallSurveyUrl|tally\\.so/r/(nPK6Ob|3E9XDL)" apps/extension/src
```

Expected: no matches.

Then run:

```bash
rg -n "tally\\.so" apps/extension/src
```

Expected: only the existing options-page product survey URL remains:

```text
apps/extension/src/entrypoints/options/app-sidebar/product-nav.tsx:const SURVEY_URL = "https://tally.so/r/kdNN5R"
apps/extension/src/entrypoints/options/app-sidebar/AGENTS.md:| `product-nav.tsx`        | "Survey" link to `https://tally.so/r/kdNN5R`.
```

- [ ] **Step 7: Run focused type check**

Run:

```bash
pnpm --filter @getu/extension type-check
```

Expected: TypeScript exits successfully with no missing import or i18n key errors.

- [ ] **Step 8: Commit implementation**

Run:

```bash
git add apps/extension/src/entrypoints/background/index.ts \
  apps/extension/src/entrypoints/background/uninstall-survey.ts \
  apps/extension/src/locales/en.yml \
  apps/extension/src/locales/zh-CN.yml \
  apps/extension/src/locales/zh-TW.yml \
  apps/extension/src/locales/ja.yml \
  apps/extension/src/locales/ko.yml \
  apps/extension/src/locales/ru.yml \
  apps/extension/src/locales/tr.yml \
  apps/extension/src/locales/vi.yml \
  apps/extension/src/entrypoints/background/AGENTS.md \
  apps/extension/src/locales/AGENTS.md
git commit -m "fix(extension): remove uninstall survey redirect"
```

Expected: commit succeeds after pre-commit hooks pass.

## Self-Review

- Spec coverage: The plan removes the background uninstall URL registration, deletes the now-unused module, deletes all locale keys, updates local AGENTS documentation, preserves the separate options-page Survey link, and verifies absence of removed references.
- Placeholder scan: The plan contains no placeholder markers, deferred-work wording, or unspecified test steps.
- Type consistency: File names, import name, locale key, Tally form IDs, and command names match the current codebase references found during exploration.
