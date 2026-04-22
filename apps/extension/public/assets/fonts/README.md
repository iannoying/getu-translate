# Noto Sans CJK SC subset font — bilingual PDF export

This directory ships a subsetted **Noto Sans CJK SC** font with the extension
so the bilingual PDF exporter (M3 PR#C, Pro tier) can draw translated
paragraphs that contain Chinese / Japanese / Korean glyphs.

WXT copies everything under `apps/extension/public/` verbatim to the
extension root at build time, so the file ends up at
`chrome-extension://<id>/assets/fonts/noto-sans-cjk-sc-subset.otf` and can be
loaded at runtime via `browser.runtime.getURL(...)` from any extension
context. See `src/utils/pdf/font-path.ts` for the canonical path constant and
URL resolver.

## Required file

- **Path:** `apps/extension/public/assets/fonts/noto-sans-cjk-sc-subset.otf`
- **Source:** [Noto Sans CJK SC](https://github.com/notofonts/noto-cjk) —
  `NotoSansCJKsc-Regular.otf` (Simplified Chinese region; covers Hiragana,
  Katakana, Hangul Syllables, and the Halfwidth + Fullwidth Forms block too,
  so a single file handles all CJK ranges `containsCJK` detects).
- **License:** [SIL Open Font License 1.1](https://openfontlicense.org/) —
  include `OFL.txt` alongside the font file in this directory when you drop
  it in.
- **Target size after subsetting:** ~400 KB (the full OTF is ~17 MB, which
  would bloat the extension bundle unacceptably).

> **Heads up:** the repo does not currently ship the actual font binary.
> Task 2 of M3 PR#C (the `pdf-lib` exporter) will fail to embed a CJK font
> until the subsetted file exists at the path above. `containsCJK` and the
> `getCjkFontUrl` helper are wired up and unit-tested, so the export code
> can be authored against them; the binary is a manual, one-time drop-in
> before shipping the Pro export feature.

## Subsetting recipe (Python + `fonttools`)

`pyftsubset` is the canonical subsetter. Install it once:

```bash
pip install fonttools brotli
```

Download `NotoSansCJKsc-Regular.otf` from the Noto CJK release on GitHub,
then run:

```bash
pyftsubset NotoSansCJKsc-Regular.otf \
  --output-file=noto-sans-cjk-sc-subset.otf \
  --unicodes='U+0020-007E,U+00A0-00FF,U+2000-206F,U+3000-303F,U+3040-309F,U+30A0-30FF,U+3400-4DBF,U+4E00-9FFF,U+AC00-D7AF,U+FF00-FFEF' \
  --layout-features='*' \
  --glyph-names \
  --symbol-cmap \
  --notdef-glyph \
  --notdef-outline \
  --recommended-glyphs \
  --name-legacy \
  --drop-tables= \
  --name-IDs='*' \
  --name-languages='*' \
  --no-hinting
```

That range covers:

- Basic Latin + Latin-1 Supplement (so Latin glyphs don't fall back to a
  system font mid-paragraph)
- General Punctuation + CJK Symbols and Punctuation
- Hiragana, Katakana
- CJK Unified Ideographs + Extension A
- Hangul Syllables
- Halfwidth + Fullwidth Forms

…which matches the `CJK_RANGES` in `src/utils/pdf/cjk.ts` (plus the Latin
ranges needed for mixed-language paragraphs).

Drop the resulting `noto-sans-cjk-sc-subset.otf` (and a copy of `OFL.txt`)
into this directory and commit.

## Why not a CDN fetch?

The exporter runs entirely client-side and must work offline (users may
trigger export on a downloaded PDF with no network). Bundling a subset keeps
the happy path deterministic; a CDN fallback can be layered on later if the
subset ever proves insufficient.
