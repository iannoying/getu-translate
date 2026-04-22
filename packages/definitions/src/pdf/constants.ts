/**
 * Free-tier daily cap on successful PDF-page translations. Matches the
 * commercialization table in `docs/plans/2026-04-20-roadmap-vs-immersive-translate.md`
 * and `docs/plans/2026-04-22-m3-pdf-translate-pr-b3.md` (Q2: count on success).
 *
 * Pro / Enterprise with `pdf_translate_unlimited` bypass this cap entirely.
 */
export const FREE_PDF_PAGES_PER_DAY = 50
