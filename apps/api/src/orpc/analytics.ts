import { analyticsTrackInputSchema, analyticsTrackOutputSchema } from "@getu/contract"
import { captureEvent } from "../analytics/posthog"
import { authed } from "./context"

export const analyticsRouter = {
  track: authed
    .input(analyticsTrackInputSchema)
    .output(analyticsTrackOutputSchema)
    .handler(async ({ context, input }) => {
      const apiKey = context.env.POSTHOG_PROJECT_KEY
      if (apiKey) {
        const userId = context.session.user.id
        const host = context.env.POSTHOG_HOST
        context.executionCtx?.waitUntil(
          captureEvent({
            apiKey,
            distinctId: userId,
            event: input.event,
            properties: input.properties ?? {},
            host,
          }).catch(() => {
            // Swallow — PostHog must never break the handler response.
          }),
        )
      }
      return { ok: true as const }
    }),
}
