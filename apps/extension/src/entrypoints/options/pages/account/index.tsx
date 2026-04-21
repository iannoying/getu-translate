import { i18n } from "#i18n"
import { Icon } from "@iconify/react"
import { useSetAtom } from "jotai"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/base-ui/card"
import {
  Progress,
  ProgressLabel,
} from "@/components/ui/base-ui/progress"
import { Skeleton } from "@/components/ui/base-ui/skeleton"
import { useEntitlements } from "@/hooks/use-entitlements"
import { FREE_ENTITLEMENTS, isPro } from "@/types/entitlements"
import { entitlementsAtom } from "@/utils/atoms/entitlements"
import { authClient } from "@/utils/auth/auth-client"
import { WEBSITE_URL } from "@/utils/constants/url"
import { deleteCachedEntitlements } from "@/utils/db/dexie/entitlements"
import { logger } from "@/utils/logger"
import { PageLayout } from "../../components/page-layout"

function formatExpiry(expiresAt: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(expiresAt))
}

function AccountPageSkeleton() {
  return (
    <PageLayout title={i18n.t("billing.account.section")}>
      <div className="mx-auto mt-8 max-w-md space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </PageLayout>
  )
}

export function AccountPage() {
  const session = authClient.useSession()
  const sessionPending = session?.isPending ?? false
  const userId = session?.data?.user?.id ?? null
  const userEmail = session?.data?.user?.email ?? ""
  const user = session?.data?.user
  const userImage = (user != null && "image" in user && typeof user.image === "string") ? user.image : null

  const { data, isLoading } = useEntitlements(userId)
  const setEntitlements = useSetAtom(entitlementsAtom)

  const proActive = isPro(data)
  const isExpired = data.expiresAt !== null && !proActive && data.tier !== "free"

  function handleUpgrade() {
    const url = new URL(`${WEBSITE_URL}/pricing`)
    url.searchParams.set("source", "options-account")
    window.open(url.toString(), "_blank", "noopener,noreferrer")
  }

  function handleManagePlan() {
    window.open(`${WEBSITE_URL}/account/billing`, "_blank", "noopener,noreferrer")
  }

  async function handleSignOut() {
    const currentUserId = userId // capture before session clears
    await authClient.signOut()
    setEntitlements(FREE_ENTITLEMENTS)
    if (currentUserId != null) {
      deleteCachedEntitlements(currentUserId).catch((err) => {
        logger.warn("[billing] cache delete failed on sign-out", err)
      })
    }
  }

  // ── Session pending ───────────────────────────────────────────────────────
  if (sessionPending) {
    return <AccountPageSkeleton />
  }

  // ── Anonymous ─────────────────────────────────────────────────────────────
  if (userId === null) {
    return (
      <PageLayout title={i18n.t("billing.account.section")}>
        <div className="mx-auto mt-8 max-w-md">
          <Card>
            <CardHeader>
              <div className="flex flex-col items-center gap-3 py-4">
                <Icon icon="tabler:user-circle" className="size-12 text-muted-foreground" />
                <p className="text-center text-sm text-muted-foreground">
                  {i18n.t("billing.account.signInPrompt")}
                </p>
              </div>
            </CardHeader>
            <CardFooter className="justify-center">
              <Button
                onClick={() => window.open(`${WEBSITE_URL}/log-in`, "_blank", "noopener,noreferrer")}
              >
                {i18n.t("billing.account.signIn")}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </PageLayout>
    )
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return <AccountPageSkeleton />
  }

  // ── Signed in (free or pro/enterprise) ────────────────────────────────────
  const tierLabel = i18n.t(`billing.tier.${data.tier}` as Parameters<typeof i18n.t>[0])
  const quotaEntries = Object.entries(data.quota)

  return (
    <PageLayout title={i18n.t("billing.account.section")}>
      <div className="mx-auto mt-8 max-w-md space-y-4">
        {/* ── Profile card ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              {userImage
                ? (
                    <img
                      src={userImage}
                      alt={userEmail}
                      className="size-10 rounded-full object-cover"
                    />
                  )
                : (
                    <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                      <Icon icon="tabler:user" className="size-5 text-muted-foreground" />
                    </div>
                  )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{userEmail}</p>
                <Badge variant={proActive ? "default" : "secondary"} className="mt-0.5">
                  {tierLabel}
                </Badge>
              </div>
            </div>
          </CardHeader>

          {/* ── Expiry / renewal info ─────────────────────────────── */}
          {data.expiresAt !== null && (
            <CardContent>
              {isExpired
                ? (
                    <p className="text-sm text-destructive">
                      {i18n.t("billing.expiry.expired")}
                    </p>
                  )
                : (
                    <p className="text-sm text-muted-foreground">
                      {i18n.t("billing.expiry.active")}
                      {" "}
                      &mdash;
                      {" "}
                      {formatExpiry(data.expiresAt)}
                    </p>
                  )}
            </CardContent>
          )}
        </Card>

        {/* ── Quota section (pro/enterprise only) ──────────────────── */}
        {proActive && quotaEntries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{i18n.t("billing.account.viewUsage")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quotaEntries.map(([key, bucket]) => {
                const pct = bucket.limit > 0 ? Math.min((bucket.used / bucket.limit) * 100, 100) : 100
                const exhausted = bucket.used >= bucket.limit
                return (
                  <Progress key={key} value={pct} aria-label={key}>
                    <ProgressLabel>{key}</ProgressLabel>
                    <span className="text-muted-foreground ml-auto text-sm tabular-nums">
                      {exhausted
                        ? i18n.t("billing.quota.exhausted")
                        : `${bucket.used} ${i18n.t("billing.quota.outOf")} ${bucket.limit} ${i18n.t("billing.quota.remaining")}`}
                    </span>
                  </Progress>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* ── Actions ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          {proActive
            ? (
                <Button onClick={handleManagePlan}>
                  {i18n.t("billing.account.managePlan")}
                </Button>
              )
            : (
                // Show upgrade CTA for both free users and expired-pro users
                <Button onClick={handleUpgrade}>
                  {i18n.t("billing.upgrade.cta")}
                </Button>
              )}

          <Button variant="outline" onClick={handleSignOut}>
            {i18n.t("billing.account.signOut")}
          </Button>
        </div>
      </div>
    </PageLayout>
  )
}
