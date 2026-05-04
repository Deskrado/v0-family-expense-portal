import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const rawName = process.argv.slice(2).join(" ").trim()
const slug = (rawName || "migration")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")

const now = new Date()
const stamp = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
  String(now.getHours()).padStart(2, "0"),
  String(now.getMinutes()).padStart(2, "0"),
  String(now.getSeconds()).padStart(2, "0"),
].join("")

const migrationsDir = join(process.cwd(), "supabase", "migrations")
mkdirSync(migrationsDir, { recursive: true })

const filePath = join(migrationsDir, `${stamp}_${slug}.sql`)
if (existsSync(filePath)) {
  throw new Error(`Migration already exists: ${filePath}`)
}

writeFileSync(filePath, `-- ${rawName || "Migration"}\n\n`, "utf8")
console.log(filePath)
