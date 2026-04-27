// NOTE: This package has no build step. package.json "main"/"types" point at raw TypeScript.
// Resolution relies on the bundler (wxt/vite + tsconfig paths) in the consuming workspace.
// If you ever need to import this from a plain Node script or Jest without bundler-aware
// paths, add a tsup/tsc build step and update exports first.

import type { ContractRouterClient } from "@orpc/contract"
import { contract as baseContract } from "./base.js"
import { billingContract } from "./billing.js"
import { translateContract } from "./translate.js"

export {
  contract,
  ColumnAddInputSchema,
  ColumnAddOutputSchema,
  ColumnDeleteInputSchema,
  ColumnDeleteOutputSchema,
  ColumnUpdateInputSchema,
  ColumnUpdateOutputSchema,
  CustomTableCreateInputSchema,
  CustomTableCreateOutputSchema,
  CustomTableDeleteInputSchema,
  CustomTableDeleteOutputSchema,
  CustomTableGetInputSchema,
  CustomTableGetOutputSchema,
  CustomTableGetSchemaInputSchema,
  CustomTableGetSchemaOutputSchema,
  CustomTableListInputSchema,
  CustomTableListItemSchema,
  CustomTableListOutputSchema,
  CustomTableUpdateInputSchema,
  CustomTableUpdateOutputSchema,
  NotebaseBetaStatusInputSchema,
  NotebaseBetaStatusOutputSchema,
  RowAddInputSchema,
  RowAddOutputSchema,
  RowDeleteInputSchema,
  RowDeleteOutputSchema,
  RowUpdateInputSchema,
  RowUpdateOutputSchema,
  TableColumnSchema,
  TableRowSchema,
  TableViewSchema,
} from "./base.js"

export type {
  CustomTableCreateInput,
  CustomTableCreateOutput,
  CustomTableDeleteInput,
  CustomTableDeleteOutput,
  CustomTableGetInput,
  CustomTableGetOutput,
  CustomTableGetSchemaInput,
  CustomTableGetSchemaOutput,
  CustomTableListInput,
  CustomTableListItem,
  CustomTableListOutput,
  CustomTableUpdateInput,
  CustomTableUpdateOutput,
  NotebaseBetaStatusInput,
  NotebaseBetaStatusOutput,
  RowAddInput,
  RowAddOutput,
  RowDeleteInput,
  RowDeleteOutput,
  RowUpdateInput,
  RowUpdateOutput,
  TableColumn,
  TableRow,
  TableView,
} from "./base.js"

export { billingContract }

export {
  EntitlementsSchema,
  FeatureKey,
  FREE_ENTITLEMENTS,
  hasFeature,
  isPro,
  QuotaBucketSchema,
  consumeQuotaInputSchema,
  consumeQuotaOutputSchema,
  QUOTA_BUCKETS,
  createCheckoutSessionInputSchema,
  createCheckoutSessionOutputSchema,
  createPortalSessionOutputSchema,
} from "./billing.js"

export type {
  Entitlements,
  ConsumeQuotaInput,
  ConsumeQuotaOutput,
  QuotaBucket,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionOutput,
  CreatePortalSessionOutput,
} from "./billing.js"

export { AI_MODEL_COEFFICIENTS, PRO_MODEL_WHITELIST, isProModel, normalizeTokens } from "./ai-models.js"
export type { ProModel } from "./ai-models.js"

// M6 — web /translate & /document contracts
export { translateContract } from "./translate.js"
export {
  TRANSLATE_TEXT_MAX_CHARS,
  TRANSLATE_DOCUMENT_MAX_PAGES,
  TRANSLATE_DOCUMENT_MAX_BYTES,
  clearHistoryInputSchema,
  clearHistoryOutputSchema,
  deleteHistoryInputSchema,
  deleteHistoryOutputSchema,
  historyResultEntrySchema,
  historyResultsSchema,
  documentCreateInputSchema,
  documentCreateOutputSchema,
  documentDownloadUrlInputSchema,
  documentDownloadUrlOutputSchema,
  documentListInputSchema,
  documentListItemSchema,
  documentListOutputSchema,
  documentRetryInputSchema,
  documentRetryOutputSchema,
  documentStatusInputSchema,
  documentStatusOutputSchema,
  listHistoryInputSchema,
  listHistoryItemSchema,
  listHistoryOutputSchema,
  saveHistoryInputSchema,
  saveHistoryOutputSchema,
  translateTextInputSchema,
  translateTextOutputSchema,
  translationJobEngineSchema,
  translationJobStatusSchema,
} from "./translate.js"
export type {
  DocumentCreateInput,
  DocumentCreateOutput,
  DocumentDownloadUrlInput,
  DocumentDownloadUrlOutput,
  DocumentListItem,
  DocumentRetryInput,
  DocumentRetryOutput,
  DocumentStatusOutput,
  HistoryResultEntry,
  ListHistoryItem,
  SaveHistoryInput,
  SaveHistoryOutput,
  TranslateTextInput,
  TranslateTextOutput,
  TranslationJobEngine,
  TranslationJobStatus,
} from "./translate.js"

export { analyticsContract } from "./analytics.js"
export {
  analyticsTrackInputSchema,
  analyticsTrackOutputSchema,
} from "./analytics.js"
export type { AnalyticsTrackInput, AnalyticsTrackOutput } from "./analytics.js"

import { analyticsContract } from "./analytics.js"

export const mergedContract = {
  ...baseContract,
  billing: billingContract,
  translate: translateContract,
  analytics: analyticsContract,
} as const

export type ORPCRouterClient = ContractRouterClient<typeof mergedContract>
