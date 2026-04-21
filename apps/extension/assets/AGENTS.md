<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# assets

## Purpose

Repository-level marketing/store/demo assets — used by `README.md`, `README.zh-CN.md`, store listings, and integration tests. **These files are NOT bundled into the extension.** `wxt.config.ts` explicitly excludes `assets/**/*` from the zip via `zip.excludeSources`.

> Do not confuse with `src/assets/`, which IS bundled.

## Key Files

| File                        | Description                                         |
| --------------------------- | --------------------------------------------------- |
| `2025-recap.png`            | Year-in-review banner used in README.               |
| `node-translation-demo.gif` | Demo GIF — node-level translation (used in README). |
| `page-translation-demo.gif` | Demo GIF — full-page translation (used in README).  |
| `read-demo.gif`             | Hero demo GIF (used in README).                     |
| `popup-page.png`            | Screenshot of the popup UI.                         |
| `opengraph.svg`             | Open Graph banner image.                            |
| `read-frog-original.png`    | Original logo artwork.                              |
| `star.png`                  | "Star us on GitHub" image.                          |
| `tabbit.avif`               | Sponsor / partner image (Tabbit).                   |
| `translate.png`             | Translate feature thumbnail.                        |
| `wechat-account.jpg`        | WeChat group QR code (used in README).              |

## Subdirectories

| Directory      | Purpose                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `pdf-example/` | Sample PDF used by integration / manual tests of PDF-to-text features (see `pdf-example/AGENTS.md`). |
| `store/`       | Web Store / Edge Add-ons listing imagery (intro screens, promo tiles) (see `store/AGENTS.md`).       |

## For AI Agents

### Working In This Directory

- Optimize images before committing — the repo is otherwise lean.
- Do NOT reference these from extension source — they are not in the build output.
- README banner shields/badges live in `README.md` itself; add referenced images here.

### Testing Requirements

- After replacing a README image, render the README on GitHub to confirm it loads.

## Dependencies

None.

<!-- MANUAL: -->
