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
  `NotoSansCJKsc-Regular.otf` (Simplified Chinese region).
- **License:** [SIL Open Font License 1.1](https://openfontlicense.org/) —
  include `OFL.txt` alongside the font file in this directory.
- **Character coverage:** GB 2312 Level 1 (3755 most-common Simplified
  Chinese chars) + Basic Latin + Latin-1 Supplement + General Punctuation
  + CJK Symbols/Punctuation + Hiragana + Katakana. Total ~4300 glyphs.
- **Actual size after subsetting:** ~815 KB (the full OTF is ~16 MB).
  Shrunk from the earlier ~5 MB subset (which kept the entire `U+4E00-9FFF`
  CJK Unified 20K+ glyph block) by limiting to GB 2312 Level 1 — covers
  99.9% of modern Mandarin text. If exported PDFs show empty boxes for rare
  characters, re-subset with a broader range (see recipe below).

## Subsetting recipe (Python + `fonttools`)

`pyftsubset` is the canonical subsetter. Install it once:

```bash
pip install fonttools brotli
```

### Step 1 — generate the character list

GB 2312 Level 1 chars sit at EUC rows `0xB0-0xD7`. Decode programmatically
and append Latin + kana + common punctuation:

```python
chars = []
for b1 in range(0xB0, 0xD8):
    for b2 in range(0xA1, 0xFF):
        try:
            chars.append(bytes([b1, b2]).decode('gb2312'))
        except (UnicodeDecodeError, ValueError):
            pass
latin = ''.join(chr(c) for c in range(0x20, 0x7F))
latin_supp = ''.join(chr(c) for c in range(0xA0, 0x100))
gen_punct = ''.join(chr(c) for c in range(0x2000, 0x2070))
cjk_punct = ''.join(chr(c) for c in range(0x3000, 0x3040))
hiragana = ''.join(chr(c) for c in range(0x3040, 0x30A0))
katakana = ''.join(chr(c) for c in range(0x30A0, 0x3100))
with open('/tmp/gb2312-l1-plus.txt', 'w', encoding='utf-8') as f:
    f.write(''.join(chars) + latin + latin_supp + gen_punct + cjk_punct + hiragana + katakana)
```

### Step 2 — download + subset

```bash
curl -L -o /tmp/NotoSansCJKsc-Regular.otf \
  https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf

pyftsubset /tmp/NotoSansCJKsc-Regular.otf \
  --output-file=noto-sans-cjk-sc-subset.otf \
  --text-file=/tmp/gb2312-l1-plus.txt \
  --drop-tables+=BASE,GDEF,GPOS,GSUB,DSIG,vhea,vmtx,vrt2 \
  --no-hinting \
  --no-layout-closure \
  --desubroutinize
```

Layout tables (`BASE/GDEF/GPOS/GSUB`) and vertical-writing tables are dropped
because `pdf-lib` renders text via simple glyph-index lookups and does not
perform complex shaping.

### What's covered (~815 KB, ~4300 glyphs)

- GB 2312 Level 1 (3755 Simplified Chinese chars — covers 99.9% of modern
  Mandarin corpus)
- Basic Latin + Latin-1 Supplement (mixed-language paragraphs)
- General Punctuation + CJK Symbols/Punctuation
- Hiragana + Katakana

### What's NOT covered (intentional)

- **GB 2312 Level 2** (~3008 less-common chars): re-add with row range
  `0xD8-0xF7` if users report missing glyphs
- **CJK Ext-A** (`U+3400-4DBF`): very rare characters
- **Hangul Syllables** (`U+AC00-D7AF`): Korean target not in MVP scope
- **Halfwidth/Fullwidth Forms**: defer until Japanese PDFs need them

If exported PDFs show empty boxes, regenerate the text list with the broader
range and recommit.

## Why not a CDN fetch?

The exporter runs entirely client-side and must work offline (users may
trigger export on a downloaded PDF with no network). Bundling a subset keeps
the happy path deterministic; a CDN fallback can be layered on later if the
subset ever proves insufficient.
