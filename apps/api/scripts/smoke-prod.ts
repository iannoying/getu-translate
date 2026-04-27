#!/usr/bin/env tsx
/**
 * Post-deploy smoke test. Detects "schema not migrated", "bucket missing",
 * "queue missing" failures within minutes of deploy. Run via `pnpm smoke:prod`
 * after a CI deploy step.
 *
 * Exit 0 = all checks passed; exit 1 = at least one check failed.
 */

const API_BASE = process.env.API_BASE_URL ?? "https://api.getutranslate.com"

type Check = {
  name: string
  run: () => Promise<{ ok: boolean; detail?: string }>
}

const checks: Check[] = [
  {
    name: "GET /health",
    run: async () => {
      try {
        const res = await fetch(`${API_BASE}/health`)
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
        return { ok: true }
      } catch (err) {
        return { ok: false, detail: (err as Error).message }
      }
    },
  },
  {
    name: "GET /orpc/billing/getEntitlements (anonymous - should 401, NOT 500)",
    run: async () => {
      try {
        const res = await fetch(`${API_BASE}/orpc/billing/getEntitlements`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        })
        // 401 means handler reached + auth check; 500 means schema/binding issue
        if (res.status === 401 || res.status === 403) return { ok: true }
        if (res.status >= 500) {
          const body = await res.text()
          return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 200)}` }
        }
        return { ok: true, detail: `HTTP ${res.status}` }
      } catch (err) {
        return { ok: false, detail: (err as Error).message }
      }
    },
  },
  {
    name: "GET /orpc/translate/document/list (anonymous - should 401)",
    run: async () => {
      try {
        const res = await fetch(`${API_BASE}/orpc/translate/document/list`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ limit: 1 }),
        })
        // Touches translation_jobs table — proves schema + binding wired
        if (res.status === 401 || res.status === 403) return { ok: true }
        if (res.status >= 500) {
          const body = await res.text()
          return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 200)}` }
        }
        return { ok: true, detail: `HTTP ${res.status}` }
      } catch (err) {
        return { ok: false, detail: (err as Error).message }
      }
    },
  },
  {
    name: "GET /orpc/translate/text/listHistory (anonymous - should 401)",
    run: async () => {
      try {
        const res = await fetch(`${API_BASE}/orpc/translate/text/listHistory`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ limit: 1 }),
        })
        if (res.status === 401 || res.status === 403) return { ok: true }
        if (res.status >= 500) {
          const body = await res.text()
          return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 200)}` }
        }
        return { ok: true, detail: `HTTP ${res.status}` }
      } catch (err) {
        return { ok: false, detail: (err as Error).message }
      }
    },
  },
]

async function main() {
  console.log(`Smoke testing ${API_BASE}`)
  let failed = 0
  for (const check of checks) {
    const result = await check.run()
    if (result.ok) {
      console.log(`PASS ${check.name}${result.detail ? ` (${result.detail})` : ""}`)
    } else {
      console.error(`FAIL ${check.name} — ${result.detail}`)
      failed++
    }
  }
  if (failed > 0) {
    console.error(`\n${failed}/${checks.length} checks failed.`)
    process.exit(1)
  }
  console.log(`\nAll ${checks.length} checks passed.`)
}

void main()
