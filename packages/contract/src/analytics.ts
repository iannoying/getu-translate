import { z } from "zod"
import { oc } from "@orpc/contract"

export const analyticsTrackInputSchema = z
  .object({
    event: z.enum([
      "text_translate_completed",
      "pdf_uploaded",
      "pdf_completed",
      "pro_upgrade_triggered",
    ]),
    properties: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
  })
  .strict()
export type AnalyticsTrackInput = z.infer<typeof analyticsTrackInputSchema>

export const analyticsTrackOutputSchema = z.object({ ok: z.literal(true) }).strict()
export type AnalyticsTrackOutput = z.infer<typeof analyticsTrackOutputSchema>

export const analyticsContract = oc.router({
  track: oc.input(analyticsTrackInputSchema).output(analyticsTrackOutputSchema),
})
