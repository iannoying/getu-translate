<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# request

## Purpose

The two scheduling primitives every translation request goes through in the background: a token-bucket rate-limited request queue with retries and stale-task dedup, and a debounced batch queue that groups same-key items into a single LLM call (with mismatch retries and per-item fallback). A binary-heap priority queue backs the request queue so high-priority translations (e.g. visible viewport) jump ahead of preloaded lookahead.

## Key Files

| File                | Description                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `priority-queue.ts` | `BinaryHeapPQ<T>` — generic min-heap, `push(item, key)` / `peek` / `pop` / `size` / `isEmpty` / `clear`. Custom comparator supported (defaults to ascending key).                                                                                                                                                                                                            |
| `request-queue.ts`  | `RequestQueue` — token bucket (`rate` tokens/sec, `capacity` bucket size), per-task `scheduleAt`, `maxRetries` with exponential backoff + 10% jitter, `timeoutMs` race-against-`Promise`, dedup by `hash` (waiting + executing maps). `setQueueOptions` re-validates against `requestQueueConfigSchema` and refills the bucket on capacity change.                           |
| `batch-queue.ts`    | `BatchQueue<T,R>` + `BatchCountMismatchError` — bucketizes by `getBatchKey(data)`, flushes when an item count or character cap is reached or after `batchDelay` ms; on `BatchCountMismatchError` retries with `1s/2s/4s/8s` backoff up to `maxRetries`, then falls back to per-item via `executeIndividual`. `setBatchConfig` re-validates against `batchQueueConfigSchema`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Stable `hash` is mandatory for the request queue's dedup.** Two distinct items with the same hash will share a promise — exactly what you want for "translate this paragraph" requests fired by both viewport scroll and explicit "translate now". Use `Sha256Hex(...)` from `@/utils/hash` to build canonical hashes.
- **`scheduleAt` controls eagerness, not priority.** A task with `scheduleAt > Date.now()` won't run yet even if tokens are available. The heap is keyed by `scheduleAt`, so "earlier-scheduled" wins — useful for preload windows.
- **`BatchCountMismatchError` is the only error that triggers batch retries.** Other errors fall through directly to per-item fallback (when `enableFallbackToIndividual` is `true` and `executeIndividual` is provided). This is intentional: count mismatches are usually transient LLM hallucinations, while other errors (network/auth) won't fix themselves on retry.
- **Two flush triggers compete: cap reached vs. timer elapsed.** `addTaskToBatch` flushes the existing batch and starts a new one when the new item would exceed `maxCharactersPerBatch`; `schedule()` also forces a flush after `batchDelay`. Don't disable one without the other or single-item batches starve.
- Both queues store their config behind `setQueueOptions/setBatchConfig` which Zod-validate via the corresponding `*ConfigSchema`. Never bypass these setters from outside (the background message handlers do go through them).
- The priority queue's comparator default is min-heap (ascending). Pass a `(a,b) => b - a` for max-heap.
- Console-log lines are commented out throughout `request-queue.ts` — leave them commented; switching to `logger.info` would noise prod logs.

### Testing Requirements

- Tests live in `request/__tests__/`. Use Vitest's fake timers (`vi.useFakeTimers()`) — both queues rely on `setTimeout`/`Date.now()`. When testing batches, also stub `executeBatch` to throw `BatchCountMismatchError` deterministically.

### Common Patterns

- **Token bucket + scheduled retry.** `executeTask` resets `task.scheduleAt = Date.now() + backoff` and re-pushes onto the heap; the next `schedule()` cycle picks it up naturally.
- **Per-key batching with bounded delay.** `pendingBatchMap` is keyed by `getBatchKey` so different language pairs / providers / contexts batch independently.

## Dependencies

### Internal

- `@/types/config/translate` — `requestQueueConfigSchema`, `batchQueueConfigSchema`.
- `@/utils/crypto-polyfill` — `getRandomUUID` for task / batch IDs.

### External

- `deepmerge-ts` — used in `setQueueOptions` to merge partial config.

<!-- MANUAL: -->
