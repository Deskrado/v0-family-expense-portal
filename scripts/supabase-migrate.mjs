import { existsSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

function loadEnv() {
  const envPath = join(process.cwd(), ".env")
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const [key, ...rest] = trimmed.split("=")
    if (!process.env[key]) {
      process.env[key] = rest.join("=")
    }
  }
}

function run(args) {
  const command = process.env.SUPABASE_CLI || "npx"
  const commandArgs = command === "npx" ? ["-y", "supabase", ...args] : args
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  })

  if (result.error) {
    console.error("No pude ejecutar Supabase CLI. Instala la CLI o deja que el script use `npx -y supabase`.")
    throw result.error
  }

  process.exit(result.status ?? 1)
}

loadEnv()

const mode = process.argv[2] || "push"
const dbUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL

if (mode === "new") {
  console.error("Usa `pnpm db:migration:new nombre_de_la_migracion`.")
  process.exit(1)
}

if (mode === "reset") {
  run(["db", "reset", "--local"])
}

if (mode === "local") {
  run(["db", "push", "--local"])
}

if (mode === "dry-run") {
  run(dbUrl ? ["db", "push", "--db-url", dbUrl, "--dry-run"] : ["db", "push", "--linked", "--dry-run"])
}

if (mode === "push") {
  run(dbUrl ? ["db", "push", "--db-url", dbUrl] : ["db", "push", "--linked"])
}

console.error(`Modo no reconocido: ${mode}`)
process.exit(1)
