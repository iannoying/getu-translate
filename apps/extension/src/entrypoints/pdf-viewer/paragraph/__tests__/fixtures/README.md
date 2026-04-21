# Paragraph aggregation test fixtures

All fixtures are **hand-crafted** TextItem[] arrays that mimic the shape
pdf.js's `PDFPageProxy.getTextContent()` returns. No live PDF was extracted —
the layouts were designed by hand from plausible academic/document layouts
because the investigation-phase dev loop (loading a real PDF in the extension,
dumping textLayer items through DevTools) is slower than hand construction
and harder to check into the repo verbatim.

## Coordinate convention

All fixtures assume **pdf.js normalised coordinates**:

- `transform = [sx, kx, ky, sy, tx, ty]`.
- `sx == sy == fontSize` (positive). We use absolute values downstream
  regardless of sign, but all fixtures keep sy positive as pdf.js does after
  its own normalisation.
- `tx` is the x-origin of the text run in PDF points (≈ CSS px at zoom 1).
- `ty` is the baseline y of the text run in PDF points. **Larger `ty` means
  higher on the page** (standard PDF convention — pdf.js preserves this).
- `width` and `height` are in PDF points.
- `fontName` is opaque (pdf.js emits names like `g_d0_f1`).

## Fixture list

| File                          | Scenario                                          |
| ----------------------------- | ------------------------------------------------- |
| `simple-paragraph.ts`         | One paragraph, three lines, single font size.     |
| `multiple-paragraphs.ts`      | Two paragraphs separated by a blank line.         |
| `heading-and-body.ts`         | Large-font heading followed by smaller-font body. |
| `double-column.ts`            | Two columns on the same page, 3 paragraphs each.  |
| `line-continuation-hyphen.ts` | Paragraph with a hyphenated line break.           |

Each fixture exports `{ items: TextItem[] }`. The fixture header comment in
each file documents the intended layout in ASCII.
