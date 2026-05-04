import { cpSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const routeSource = join(root, "e2e", "fixtures", "app", "e2e")
const routeTarget = join(root, "app", "e2e")
const nextDir = join(root, ".next")

rmSync(routeTarget, { force: true, recursive: true })
cpSync(routeSource, routeTarget, { recursive: true })

try {
  const result = spawnSync("playwright", ["test", ...process.argv.slice(2)], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  })

  process.exitCode = result.status ?? 1
} finally {
  rmSync(routeTarget, { force: true, recursive: true })
  rmSync(nextDir, { force: true, recursive: true })
}
