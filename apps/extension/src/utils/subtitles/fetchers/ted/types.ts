import { z } from "zod"

/**
 * A single cue inside a TED paragraph.
 *
 * TED's transcript JSON returns time as milliseconds from video start. Only a
 * start time is provided — end times must be derived from the next cue's
 * start (or a fallback duration for the final cue).
 */
export const tedCueSchema = z.object({
  time: z.number(),
  text: z.string(),
})

export const tedParagraphSchema = z.object({
  cues: z.array(tedCueSchema).default([]),
  speaker: z.string().optional(),
})

export const tedTranscriptResponseSchema = z.object({
  paragraphs: z.array(tedParagraphSchema).default([]),
})

export type TedCue = z.infer<typeof tedCueSchema>
export type TedParagraph = z.infer<typeof tedParagraphSchema>
export type TedTranscriptResponse = z.infer<typeof tedTranscriptResponseSchema>

export interface TedResolvedTrack {
  slug: string
  language: string
}
