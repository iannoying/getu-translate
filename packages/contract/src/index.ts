// NOTE: This package has no build step. package.json "main"/"types" point at raw TypeScript.
// Resolution relies on the bundler (wxt/vite + tsconfig paths) in the consuming workspace.
// If you ever need to import this from a plain Node script or Jest without bundler-aware
// paths, add a tsup/tsc build step and update exports first.

import type { ContractRouterClient } from "@orpc/contract"
import { contract as baseContract } from "./base.js"
import { billingContract } from "./billing.js"

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

export const mergedContract = {
  ...baseContract,
  billing: billingContract,
} as const

export type ORPCRouterClient = ContractRouterClient<typeof mergedContract>
