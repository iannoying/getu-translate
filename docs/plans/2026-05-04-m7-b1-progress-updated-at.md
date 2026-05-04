# M7-B1 Progress Updated At Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `translation_jobs.progress_updated_at` and use it for stuck-job detection so long-running PDF jobs are marked stuck only when progress has stopped.

**Architecture:** Add a nullable `progress_updated_at` timestamp column to `translation_jobs`, backfill existing rows to `created_at` in the migration for legacy compatibility, and update every queue progress/final/failure transition to write a fresh timestamp. The stuck sweep will compare `COALESCE(progress_updated_at, created_at)` with the 30-minute cutoff, so legacy rows remain sweepable while active jobs with recent progress are protected from false positives.

**Tech Stack:** Drizzle ORM · SQLite/D1 migrations · Cloudflare Workers queue consumer · Vitest 4 · better-sqlite3 in-memory test DB.

---

## File Structure

- Modify `packages/db/src/schema/translate.ts`: add nullable `progressUpdatedAt` to `translationJobs`.
- Create `packages/db/drizzle/0007_progress_updated_at.sql`: append-only D1 migration adding the nullable column and backfilling existing rows.
- Create/update `packages/db/drizzle/meta/0007_snapshot.json` and `packages/db/drizzle/meta/_journal.json`: generated Drizzle metadata.
- Modify `packages/db/src/schema/__tests__/translate.test.ts`: assert the new schema column exists and is nullable.
- Modify `apps/api/src/queue/translate-document.ts`: write `progressUpdatedAt` whenever progress/status changes.
- Modify `apps/api/src/queue/__tests__/translate-document.test.ts`: verify queued→processing, progress, done, and failed transitions update the column.
- Modify `apps/api/src/scheduled/translation-stuck-sweep.ts`: use `COALESCE(progress_updated_at, created_at)` in stuck detection and update.
- Modify `apps/api/src/scheduled/__tests__/translation-stuck-sweep.test.ts`: cover recent progress, stale progress, and `NULL` legacy rows.

---

## Task 1: DB Schema And Migration

**Files:**
- Modify: `packages/db/src/schema/translate.ts`
- Modify: `packages/db/src/schema/__tests__/translate.test.ts`
- Create: `packages/db/drizzle/0007_progress_updated_at.sql`
- Create/Modify: `packages/db/drizzle/meta/0007_snapshot.json`
- Modify: `packages/db/drizzle/meta/_journal.json`

- [ ] **Step 1: Add failing schema test**

Add this test inside the `describe("translation_jobs schema", ...)` block in `packages/db/src/schema/__tests__/translate.test.ts`:

```ts
it("progressUpdatedAt is nullable (legacy rows may not have a progress heartbeat)", () => {
  const col = getTableColumns(translationJobs).progressUpdatedAt
  expect(col.dataType).toBe("date")
  expect(col.notNull).toBe(false)
})
```

Also add `"progressUpdatedAt"` to the required columns array in the first `translation_jobs` test.

- [ ] **Step 2: Run schema test to verify it fails**

Run:

```bash
pnpm --filter @getu/db exec vitest run src/schema/__tests__/translate.test.ts
```

Expected: FAIL because `progressUpdatedAt` is undefined.

- [ ] **Step 3: Add schema column**

In `packages/db/src/schema/translate.ts`, add this field immediately after `progress`:

```ts
    /** Timestamp (ms) of the latest progress/status heartbeat. Null only for legacy rows. */
    progressUpdatedAt: integer("progress_updated_at", { mode: "timestamp_ms" }),
```

- [ ] **Step 4: Generate migration metadata**

Run:

```bash
pnpm --filter @getu/db generate
```

Expected: Drizzle creates a new `packages/db/drizzle/0007_*.sql`, a `meta/0007_snapshot.json`, and updates `meta/_journal.json`.

- [ ] **Step 5: Normalize migration filename and SQL**

Rename the generated SQL file to:

```bash
mv packages/db/drizzle/0007_*.sql packages/db/drizzle/0007_progress_updated_at.sql
```

Ensure `packages/db/drizzle/0007_progress_updated_at.sql` contains exactly:

```sql
ALTER TABLE `translation_jobs` ADD `progress_updated_at` integer;
--> statement-breakpoint
UPDATE `translation_jobs` SET `progress_updated_at` = `created_at` WHERE `progress_updated_at` IS NULL;
```

Then update the corresponding `_journal.json` entry for index `7` so its `tag` is:

```json
"0007_progress_updated_at"
```

- [ ] **Step 6: Run DB metadata check and schema tests**

Run:

```bash
pnpm --filter @getu/db check:meta
pnpm --filter @getu/db exec vitest run src/schema/__tests__/translate.test.ts
```

Expected: both pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/db/src/schema/translate.ts \
        packages/db/src/schema/__tests__/translate.test.ts \
        packages/db/drizzle/0007_progress_updated_at.sql \
        packages/db/drizzle/meta/0007_snapshot.json \
        packages/db/drizzle/meta/_journal.json
git commit -m "feat(db): add translation job progress heartbeat column"
```

---

## Task 2: Queue Consumer Heartbeats

**Files:**
- Modify: `apps/api/src/queue/translate-document.ts`
- Modify: `apps/api/src/queue/__tests__/translate-document.test.ts`

- [ ] **Step 1: Add failing queue tests**

In the happy-path test in `apps/api/src/queue/__tests__/translate-document.test.ts`, after fetching `job`, add:

```ts
expect(job?.progressUpdatedAt).toBeInstanceOf(Date)
expect(job?.progressUpdatedAt?.getTime()).toBeGreaterThan(0)
```

In the scanned-PDF failure test and the R2-missing failure test, after `expect(job?.failedAt).not.toBeNull()`, add:

```ts
expect(job?.progressUpdatedAt).toBeInstanceOf(Date)
expect(job?.progressUpdatedAt?.getTime()).toBeGreaterThan(0)
```

Add this test after the happy-path test:

```ts
it("updates progressUpdatedAt on every progress callback", async () => {
  const { db } = makeTestDb()
  await setupJob(db, { jobId: "j-progress", userId: "u-progress", sourcePages: 2 })
  const pdfBuf = readFileSync(resolve(FIXTURE_DIR, "hello-world.pdf"))
  const pdfAb = pdfBuf.buffer.slice(pdfBuf.byteOffset, pdfBuf.byteOffset + pdfBuf.byteLength)

  const seen: number[] = []
  const handler = createQueueHandler({
    db: db as unknown as Db,
    bucket: {
      get: vi.fn(async () => ({ arrayBuffer: async () => pdfAb })),
      put: vi.fn(async () => undefined),
    } as unknown as R2Bucket,
    env: {} as any,
    pipelineOpts: { concurrency: 1, maxRetries: 0, baseBackoffMs: 0 },
    translateChunk: async () => {
      const row = await db
        .select()
        .from(schema.translationJobs)
        .where(eq(schema.translationJobs.id, "j-progress"))
        .get()
      seen.push(row?.progressUpdatedAt?.getTime() ?? 0)
      return "你好"
    },
  })

  const { batch } = makeBatch("j-progress")
  await handler.queue(batch as any, {} as any, {} as any)

  expect(seen.length).toBeGreaterThan(0)
  expect(seen.every((ts) => ts > 0)).toBe(true)
})
```

- [ ] **Step 2: Run queue tests to verify they fail**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/queue/__tests__/translate-document.test.ts
```

Expected: FAIL because queue updates do not set `progressUpdatedAt` yet.

- [ ] **Step 3: Add heartbeat writes**

In `apps/api/src/queue/translate-document.ts`, update the queued→processing transition:

```ts
  const now = new Date()
  await db
    .update(schema.translationJobs)
    .set({
      status: "processing",
      progress: JSON.stringify({ stage: "extracting", pct: 0 }),
      progressUpdatedAt: now,
    })
    .where(eq(schema.translationJobs.id, jobId))
```

Update `writeProgress` to write a fresh heartbeat:

```ts
    const writeProgress = async (p: {
      stage: string
      pct: number
      chunk?: number
      chunkTotal?: number
    }) => {
      await db
        .update(schema.translationJobs)
        .set({
          progress: JSON.stringify(p),
          progressUpdatedAt: new Date(),
        })
        .where(eq(schema.translationJobs.id, jobId))
    }
```

Update the done transition:

```ts
      await db
        .update(schema.translationJobs)
        .set({
          status: "done",
          outputHtmlKey: htmlKey,
          outputMdKey: mdKey,
          progress: null,
          progressUpdatedAt: new Date(),
        })
        .where(eq(schema.translationJobs.id, jobId))
```

Update `fail()`:

```ts
  await db
    .update(schema.translationJobs)
    .set({
      status: "failed",
      progress: null,
      progressUpdatedAt: now,
      errorMessage,
      errorCode,
      failedAt: now,
    })
    .where(eq(schema.translationJobs.id, job.id))
```

- [ ] **Step 4: Run queue tests**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/queue/__tests__/translate-document.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/api/src/queue/translate-document.ts apps/api/src/queue/__tests__/translate-document.test.ts
git commit -m "feat(api): update pdf job progress heartbeat"
```

---

## Task 3: Stuck Sweep Uses Progress Heartbeat

**Files:**
- Modify: `apps/api/src/scheduled/translation-stuck-sweep.ts`
- Modify: `apps/api/src/scheduled/__tests__/translation-stuck-sweep.test.ts`

- [ ] **Step 1: Add failing stuck-sweep tests**

In `apps/api/src/scheduled/__tests__/translation-stuck-sweep.test.ts`, change `insertJob` to accept an optional `progressUpdatedAt`:

```ts
async function insertJob(
  db: ReturnType<typeof makeTestDb>["db"],
  opts: {
    id: string
    userId: string
    status: string
    createdAt: Date
    progressUpdatedAt?: Date | null
  },
) {
  await db.insert(schema.translationJobs).values({
    id: opts.id,
    userId: opts.userId,
    sourceKey: `pdfs/${opts.userId}/${opts.id}/source.pdf`,
    sourcePages: 1,
    modelId: "google",
    sourceLang: "en",
    targetLang: "zh-Hans",
    engine: "simple",
    status: opts.status as "queued" | "processing" | "done" | "failed",
    expiresAt: new Date(NOW_MS + 30 * 86400_000),
    createdAt: opts.createdAt,
    progressUpdatedAt: opts.progressUpdatedAt,
  })
}
```

Add these tests:

```ts
it("does NOT mark an old processing job as stuck when progress was updated recently", async () => {
  const { db } = makeTestDb()
  await insertUser(db, "u-progress-recent")
  await insertJob(db, {
    id: "j-progress-recent",
    userId: "u-progress-recent",
    status: "processing",
    createdAt: new Date(STUCK_MS),
    progressUpdatedAt: new Date(RECENT_MS),
  })

  const result = await runTranslationStuckSweep(db as any, { now: NOW_MS })

  expect(result.stuckMarkedFailed).toBe(0)
  const job = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-progress-recent")).get()
  expect(job?.status).toBe("processing")
})

it("marks a processing job as stuck when progressUpdatedAt is older than threshold", async () => {
  const { db } = makeTestDb()
  await insertUser(db, "u-progress-stale")
  await insertJob(db, {
    id: "j-progress-stale",
    userId: "u-progress-stale",
    status: "processing",
    createdAt: new Date(RECENT_MS),
    progressUpdatedAt: new Date(STUCK_MS),
  })

  const result = await runTranslationStuckSweep(db as any, { now: NOW_MS })

  expect(result.stuckMarkedFailed).toBe(1)
  const job = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-progress-stale")).get()
  expect(job?.status).toBe("failed")
  expect(job?.failedAt).not.toBeNull()
})

it("falls back to createdAt for legacy processing rows with NULL progressUpdatedAt", async () => {
  const { db } = makeTestDb()
  await insertUser(db, "u-legacy")
  await insertJob(db, {
    id: "j-legacy",
    userId: "u-legacy",
    status: "processing",
    createdAt: new Date(STUCK_MS),
    progressUpdatedAt: null,
  })

  const result = await runTranslationStuckSweep(db as any, { now: NOW_MS })

  expect(result.stuckMarkedFailed).toBe(1)
  const job = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-legacy")).get()
  expect(job?.status).toBe("failed")
})
```

- [ ] **Step 2: Run stuck-sweep tests to verify they fail**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/scheduled/__tests__/translation-stuck-sweep.test.ts
```

Expected: FAIL because the sweep still uses `createdAt`.

- [ ] **Step 3: Change stuck predicate**

In `apps/api/src/scheduled/translation-stuck-sweep.ts`, update imports:

```ts
import { and, eq, lt, sql } from "drizzle-orm"
```

Add helper:

```ts
function stuckHeartbeatCutoff(cutoff: Date) {
  return lt(sql`COALESCE(${schema.translationJobs.progressUpdatedAt}, ${schema.translationJobs.createdAt})`, cutoff)
}
```

Replace both `lt(schema.translationJobs.createdAt, cutoff)` occurrences with:

```ts
stuckHeartbeatCutoff(cutoff)
```

Update the comment above the query:

```ts
  // Heuristic: status='processing' and last heartbeat older than threshold.
  // progress_updated_at is set on queue progress/final/failure transitions.
  // Legacy rows with NULL progress_updated_at fall back to created_at.
```

- [ ] **Step 4: Run stuck-sweep tests**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/scheduled/__tests__/translation-stuck-sweep.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/api/src/scheduled/translation-stuck-sweep.ts apps/api/src/scheduled/__tests__/translation-stuck-sweep.test.ts
git commit -m "fix(api): use progress heartbeat for stuck pdf jobs"
```

---

## Task 4: Verification

**Files:**
- No code files unless a verification failure reveals a bug.

- [ ] **Step 1: Run targeted API and DB tests**

Run:

```bash
pnpm --filter @getu/db test
pnpm --filter @getu/api exec vitest run \
  src/queue/__tests__/translate-document.test.ts \
  src/scheduled/__tests__/translation-stuck-sweep.test.ts \
  src/scheduled/__tests__/translation-retry.test.ts
```

Expected: pass.

- [ ] **Step 2: Run type-checks**

Run:

```bash
pnpm --filter @getu/db check:meta
pnpm --filter @getu/api type-check
```

Expected: pass.

- [ ] **Step 3: Grep audit**

Run:

```bash
rg -n "progressUpdatedAt|progress_updated_at|createdAt, cutoff|created_at.*30" packages/db apps/api/src
```

Expected:
- `progressUpdatedAt` appears in schema, queue, tests, and stuck sweep.
- No stuck-sweep predicate remains that uses only `createdAt` for processing-job timeout.

- [ ] **Step 4: Commit verification-only fixes if needed**

If any verification revealed a bug and required edits, commit them:

```bash
git add <changed-paths>
git commit -m "test(api): cover progress heartbeat verification"
```

---

## Self-Review

- Spec coverage: The plan covers schema, migration, queue heartbeat writes, stuck sweep predicate change, and tests for populated and NULL legacy rows.
- Placeholder scan: No `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: The schema field is consistently named `progressUpdatedAt` in TypeScript and `progress_updated_at` in SQL.
- Migration constraints: Migration SQL uses only literal SQL, no runtime imports or helpers, and is append-only.

## Acceptance Mapping

| Acceptance | Verification |
|---|---|
| Migration adds nullable column safely | Task 1 migration adds nullable integer column and backfills existing rows; DB schema test asserts nullable |
| Stuck sweep uses new column | Task 3 changes predicate to `COALESCE(progress_updated_at, created_at)` |
| Tests cover populated progress timestamp | Task 3 recent/stale progress tests |
| Tests cover NULL legacy rows | Task 3 legacy NULL fallback test |
| Threshold remains 30min | `STUCK_THRESHOLD_MS` remains unchanged |
