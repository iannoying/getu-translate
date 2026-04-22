import { z } from "zod"

/**
 * Bilibili subtitle metadata track as returned by `api.bilibili.com/x/player/v2`.
 *
 * `subtitle_url` is protocol-relative (e.g. `//aisubtitle.hdslb.com/.../file.json`)
 * and must be prefixed with `https:` before fetch.
 */
export const bilibiliSubtitleTrackSchema = z.object({
  id: z.number().optional(),
  lan: z.string(),
  lan_doc: z.string().optional().default(""),
  is_lock: z.boolean().optional(),
  subtitle_url: z.string(),
  type: z.number().optional(),
  ai_type: z.number().optional(),
  ai_status: z.number().optional(),
})

export const bilibiliPlayerV2ResponseSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z.object({
    subtitle: z.object({
      subtitles: z.array(bilibiliSubtitleTrackSchema).default([]),
    }).optional(),
  }).optional(),
})

export const bilibiliPageSchema = z.object({
  cid: z.number(),
  page: z.number().optional(),
  part: z.string().optional(),
})

export const bilibiliViewResponseSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z.object({
    bvid: z.string().optional(),
    aid: z.number().optional(),
    cid: z.number(),
    pages: z.array(bilibiliPageSchema).default([]),
  }).optional(),
})

export const bilibiliCueSchema = z.object({
  from: z.number(),
  to: z.number(),
  content: z.string(),
})

export const bilibiliSubtitleFileSchema = z.object({
  body: z.array(bilibiliCueSchema).default([]),
})

export type BilibiliSubtitleTrack = z.infer<typeof bilibiliSubtitleTrackSchema>
export type BilibiliViewResponse = z.infer<typeof bilibiliViewResponseSchema>
export type BilibiliPlayerV2Response = z.infer<typeof bilibiliPlayerV2ResponseSchema>
export type BilibiliSubtitleFile = z.infer<typeof bilibiliSubtitleFileSchema>

export interface BilibiliResolvedTrack {
  videoId: string
  cid: number
  lan: string
  subtitleUrl: string
}
