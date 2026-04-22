import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { schema } from "@getu/db"
import { resolve } from "path"
import { readFileSync, readdirSync } from "fs"

// From utils/: ../__tests__ → ../src → ../api → ../apps → ../<repo-root>
const migrationsDir = resolve(
  __dirname,
  "../../../../../packages/db/drizzle",
)

function runMigrations(sqlite: InstanceType<typeof Database>) {
  const files = readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith(".sql"))
    .sort()
  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), "utf8")
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s: string) => s.trim())
      .filter(Boolean)
    for (const stmt of statements) {
      sqlite.exec(stmt)
    }
  }
}

export function makeTestDb() {
  const sqlite = new Database(":memory:")
  runMigrations(sqlite)
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

export type TestDb = ReturnType<typeof makeTestDb>
