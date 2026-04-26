#!/usr/bin/env node
// Schema-drift guard. Runs `drizzle-kit generate` (read-only-style: we
// throw away whatever it would have written) and fails if it would have
// produced a new migration. The expected steady state is:
//
//   No schema changes, nothing to migrate 😴
//
// printed to stdout. Any other final-summary line means the TS schema in
// `src/schema/*.ts` has drifted from `drizzle/meta/<latest>_snapshot.json`,
// and the developer needs to run `pnpm --filter @getu/db generate` to add
// a real migration.
//
// We also snapshot the SQL file list before and after so a successful
// "no changes" run still leaves the directory exactly as we found it.

import { readdirSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoPkgRoot = dirname(here)
const drizzleDir = join(repoPkgRoot, "drizzle")
const metaDir = join(drizzleDir, "meta")

function listFiles(dir) {
  return new Set(readdirSync(dir))
}

const beforeSql = listFiles(drizzleDir)
const beforeMeta = listFiles(metaDir)

const proc = spawnSync(
  "npx",
  ["drizzle-kit", "generate", "--name=__check_meta_drift__"],
  { cwd: repoPkgRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
)

const stdout = proc.stdout ?? ""
const stderr = proc.stderr ?? ""
const cleanOutput = (stdout + stderr).trim()

// Restore: if drizzle-kit *did* write a new migration (drift), delete the
// transient files BEFORE failing so we don't leave the worktree dirty.
function diffAndCleanup(before, dir) {
  const after = listFiles(dir)
  const created = [...after].filter(f => !before.has(f))
  for (const f of created) {
    rmSync(join(dir, f), { force: true, recursive: false })
  }
  return created
}

const newSql = diffAndCleanup(beforeSql, drizzleDir)
const newMeta = diffAndCleanup(beforeMeta, metaDir)

if (proc.status !== 0) {
  console.error("[check:meta] drizzle-kit exited with status", proc.status)
  console.error(cleanOutput)
  process.exit(1)
}

const noDrift = /no schema changes/i.test(stdout) || /nothing to migrate/i.test(stdout)

if (!noDrift || newSql.length > 0 || newMeta.length > 0) {
  console.error("[check:meta] ❌ Schema drift detected.")
  if (newSql.length > 0) console.error("    New SQL files would have been written:", newSql)
  if (newMeta.length > 0) console.error("    New meta files would have been written:", newMeta)
  console.error("")
  console.error("    Drizzle-kit output:")
  console.error(cleanOutput.split("\n").map(l => "      " + l).join("\n"))
  console.error("")
  console.error("    Fix: run `pnpm --filter @getu/db generate`,")
  console.error("    review and commit the new SQL + snapshot files, then re-run.")
  process.exit(1)
}

console.log("[check:meta] ✅ Schema is in sync with drizzle/meta/.")
