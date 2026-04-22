/**
 * Usage:
 *   HTTP_PROXY="" pnpm --filter @getu/api exec tsx scripts/grant-pro.ts --email=user@example.com --days=365
 *
 * Manually grants Pro tier to a user by email. Phase 4 replaces with Stripe webhook.
 * Runs via `wrangler d1 execute` — needs HTTP_PROXY="" per project_cf_deploy_lessons.md.
 */
import { execSync } from "node:child_process"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    days: { type: "string", default: "365" },
    env: { type: "string", default: "production" },
    features: {
      type: "string",
      default: "ai_translate_pool,pdf_translate,input_translate_unlimited,vocab_unlimited",
    },
  },
})

if (!values.email) {
  console.error("Usage: grant-pro.ts --email=<email> [--days=365] [--env=production|local]")
  process.exit(1)
}

const email = values.email
const expiresAt = Date.now() + Number(values.days) * 86400_000
const features = JSON.stringify(values.features!.split(","))
const envFlag = values.env === "local" ? "--local" : "--remote"

function d1(cmd: string): string {
  return execSync(
    `wrangler d1 execute getu-translate ${envFlag} --json --command=${JSON.stringify(cmd)}`,
    { encoding: "utf8", env: { ...process.env, HTTP_PROXY: "", HTTPS_PROXY: "" } },
  )
}

// 1. Look up user id
const lookupRaw = d1(`SELECT id FROM user WHERE email = '${email.replace(/'/g, "''")}'`)
const lookup = JSON.parse(lookupRaw) as Array<{ results?: Array<{ id: string }> }>
const userId = lookup?.[0]?.results?.[0]?.id
if (!userId) {
  console.error(`No user found with email ${email}`)
  process.exit(2)
}

// 2. Upsert entitlements
d1(`
  INSERT INTO user_entitlements (user_id, tier, features, expires_at, updated_at)
  VALUES ('${userId}', 'pro', '${features.replace(/'/g, "''")}', ${expiresAt}, strftime('%s','now')*1000)
  ON CONFLICT(user_id) DO UPDATE SET
    tier = 'pro',
    features = excluded.features,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at
`)

console.log(`✓ Granted Pro to ${email} (user_id=${userId}, expires=${new Date(expiresAt).toISOString()})`)
