import { defineConfig } from "drizzle-kit"

/**
 * Drizzle config for local migration generation.
 * Production migrations are applied via `wrangler d1 execute <db> --file=./drizzle/000N_<name>.sql`.
 * The `dbCredentials.url` here points at a local SQLite file used only to let drizzle-kit
 * introspect / generate SQL — it is NOT the production DB.
 */
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./.drizzle-local.sqlite",
  },
  verbose: true,
  strict: true,
})
