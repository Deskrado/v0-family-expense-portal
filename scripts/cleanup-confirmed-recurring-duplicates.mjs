import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"

function loadEnv() {
  const path = join(process.cwd(), ".env")
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const [key, ...rest] = trimmed.split("=")
    if (!process.env[key]) process.env[key] = rest.join("=")
  }
}

loadEnv()

const apply = process.argv.includes("--apply")
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY")

const confirmedPairs = [
  { description: "ChatGPT", duplicateId: "42cb082a-a203-4da6-b195-1568926b71c8", keeperId: "e742b614-a175-42e4-9d2b-2e3b6272e6b3" },
  { description: "Github", duplicateId: "d43a0f66-a17b-44f4-84a4-83c207d333c3", keeperId: "41d434f9-f73b-4389-a085-2e9cbc2fea78" },
  { description: "Google One", duplicateId: "1108194b-d9ff-4fba-b1d0-b22806389ec6", keeperId: "3f3d8bd6-d9e2-48cc-9e30-5b2a81cb8a43" },
  { description: "Linkedin", duplicateId: "a0470318-d4a7-4553-9dab-6a5c4dc773cb", keeperId: "aa7dedd2-34c2-41bf-8af6-f8eb2a368b90" },
]

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const ids = confirmedPairs.flatMap(({ duplicateId, keeperId }) => [duplicateId, keeperId])
const { data, error } = await supabase
  .from("transactions")
  .select("id, family_id, description, amount, transaction_date, type, is_recurring, payment_method, archived_at, metadata")
  .in("id", ids)
if (error) throw error

const byId = new Map((data || []).map((row) => [row.id, row]))
const validated = []
for (const pair of confirmedPairs) {
  const duplicate = byId.get(pair.duplicateId)
  const keeper = byId.get(pair.keeperId)
  if (!duplicate || !keeper) throw new Error(`${pair.description}: no se encontraron ambas filas confirmadas`)
  if (
    duplicate.family_id !== keeper.family_id ||
    duplicate.description.trim().toLowerCase() !== keeper.description.trim().toLowerCase() ||
    duplicate.transaction_date.slice(0, 7) !== "2026-07" ||
    keeper.transaction_date.slice(0, 7) !== "2026-07" ||
    duplicate.type !== "expense" || keeper.type !== "expense" ||
    !duplicate.is_recurring || !keeper.is_recurring ||
    duplicate.payment_method !== keeper.payment_method
  ) {
    throw new Error(`${pair.description}: las filas ya no cumplen la identidad fuerte esperada; no se modifica nada`)
  }
  validated.push({ ...pair, duplicate, keeper })
}

console.table(validated.map(({ description, duplicate, keeper }) => ({
  description,
  duplicate_id: duplicate.id,
  duplicate_amount: duplicate.amount,
  keeper_id: keeper.id,
  keeper_amount: keeper.amount,
  already_archived: Boolean(duplicate.archived_at),
})))

if (!apply) {
  console.log("Dry-run: no se modificó ninguna fila. Ejecuta con --apply para archivar estos cuatro duplicados.")
} else {
  const archivedAt = new Date().toISOString()
  for (const { duplicate, keeper } of validated) {
    if (duplicate.archived_at) continue
    const metadata = {
      ...(duplicate.metadata || {}),
      duplicate_cleanup: {
        cleaned_at: archivedAt,
        reason: "confirmed_cross_user_family_recurring_duplicate",
        keeper_transaction_id: keeper.id,
      },
    }
    const { error: updateError } = await supabase
      .from("transactions")
      .update({ archived_at: archivedAt, metadata })
      .eq("id", duplicate.id)
      .is("archived_at", null)
    if (updateError) throw updateError
  }

  console.log("Apply completo: los cuatro duplicados confirmados quedaron archivados y auditados.")
}
