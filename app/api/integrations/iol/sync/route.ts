import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptJson, encryptJson } from "@/lib/integrations/crypto"
import {
  fetchIolReadOnlyData,
  IolSecret,
  parseIolPositions,
  refreshIolToken,
} from "@/lib/integrations/providers/iol"

async function getCurrencyId(admin: ReturnType<typeof createAdminClient>, code: string) {
  const normalized = code.toUpperCase() === "US$" ? "USD" : code.toUpperCase()
  const { data } = await admin.from("currencies").select("id").eq("code", normalized).maybeSingle()
  return data?.id || null
}

export async function POST(request: NextRequest) {
  let admin: ReturnType<typeof createAdminClient> | null = null
  let connectionIdForError: string | null = null
  let userIdForError: string | null = null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    userIdForError = user.id

    const { connectionId } = await request.json()
    if (!connectionId) return NextResponse.json({ error: "connectionId requerido" }, { status: 400 })
    connectionIdForError = connectionId

    admin = createAdminClient()
    const { data: connection, error: connectionError } = await admin
      .from("broker_connections")
      .select("*, provider:external_providers(*), secret:integration_secrets(*)")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .single()

    if (connectionError) throw connectionError
    if (!connection.secret) throw new Error("La conexion no tiene secreto activo")

    let secret = decryptJson<IolSecret>(connection.secret)
    const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0
    if (expiresAt - Date.now() < 60_000) {
      const refreshed = await refreshIolToken({
        refreshToken: secret.refresh_token,
        baseUrl: secret.base_url,
      })
      secret = { ...refreshed, obtained_at: new Date().toISOString(), base_url: secret.base_url }
      const encrypted = encryptJson(secret)
      await admin.from("integration_secrets").update(encrypted).eq("id", connection.secret.id)
      await admin
        .from("broker_connections")
        .update({
          access_token_expires_at: new Date(Date.now() + Number(refreshed.expires_in || 900) * 1000).toISOString(),
          status: "active",
          last_error: null,
        })
        .eq("id", connection.id)
    }

    const raw = await fetchIolReadOnlyData(secret.base_url, secret.access_token)
    const rawHash = createHash("sha256").update(JSON.stringify(raw)).digest("hex")
    const positions = parseIolPositions(raw)
    const arsCurrencyId = await getCurrencyId(admin, "ARS")

    const { data: account, error: accountError } = await admin
      .from("broker_accounts")
      .upsert({
        user_id: user.id,
        connection_id: connection.id,
        external_account_id: "iol-default",
        name: "IOL Argentina",
        base_currency_id: arsCurrencyId,
        status: "active",
        metadata: { source: "iol" },
      }, { onConflict: "connection_id,external_account_id" })
      .select("*")
      .single()

    if (accountError) throw accountError

    const totalValue = positions.reduce((total, position) => total + Number(position.marketValue || 0), 0)
    const { data: snapshot, error: snapshotError } = await admin
      .from("portfolio_snapshots")
      .insert({
        user_id: user.id,
        connection_id: connection.id,
        account_id: account.id,
        total_value: totalValue,
        currency_id: arsCurrencyId,
        source: "iol",
        raw_hash: rawHash,
        raw,
      })
      .select("*")
      .single()

    if (snapshotError) throw snapshotError

    await admin.from("broker_positions").delete().eq("account_id", account.id)

    for (const position of positions) {
      const currencyId = await getCurrencyId(admin, position.currencyCode)
      const { data: instrument } = await admin
        .from("market_instruments")
        .upsert({
          provider_id: connection.provider_id,
          symbol: position.symbol,
          market: position.market,
          instrument_type: position.instrumentType,
          currency_id: currencyId,
          name: position.name,
          provider_symbol: position.symbol,
          metadata: { source: "iol" },
        }, { onConflict: "provider_id,symbol,market" })
        .select("*")
        .single()

      await admin.from("broker_positions").insert({
        user_id: user.id,
        account_id: account.id,
        instrument_id: instrument?.id || null,
        quantity: position.quantity,
        avg_cost: position.avgCost || null,
        currency_id: currencyId,
        market_value: position.marketValue,
        price: position.price,
        source: "iol",
        raw: position.raw,
      })

      await admin.from("portfolio_snapshot_items").insert({
        user_id: user.id,
        snapshot_id: snapshot.id,
        instrument_id: instrument?.id || null,
        quantity: position.quantity,
        price: position.price,
        market_value: position.marketValue,
        currency_id: currencyId,
        raw: position.raw,
      })
    }

    await admin
      .from("broker_connections")
      .update({ last_sync_at: new Date().toISOString(), status: "active", last_error: null })
      .eq("id", connection.id)

    await admin.from("integration_audit_events").insert({
      user_id: user.id,
      connection_id: connection.id,
      event_type: "iol_sync",
      status: "success",
      message: `Sincronizadas ${positions.length} posiciones read-only`,
      metadata: { positions: positions.length, rawHash },
    })

    return NextResponse.json({ ok: true, positions: positions.length, snapshotId: snapshot.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al sincronizar IOL"
    const requiresReconnect = message.includes("refresh token") || message.includes("(401)")
    if (requiresReconnect && admin && connectionIdForError) {
      await admin
        .from("broker_connections")
        .update({
          status: "reauth_required",
          last_error: "IOL requiere reconectar la cuenta",
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionIdForError)

      await admin.from("integration_audit_events").insert({
        user_id: userIdForError,
        connection_id: connectionIdForError,
        event_type: "iol_sync",
        status: "reauth_required",
        message: "IOL rechazo el refresh token. Reconecta la cuenta desde Configuracion.",
      })
    }

    return NextResponse.json(
      {
        error: requiresReconnect
          ? "IOL requiere reconectar la cuenta desde Configuracion > Integraciones"
          : message,
        code: requiresReconnect ? "IOL_REAUTH_REQUIRED" : "IOL_SYNC_ERROR",
      },
      { status: requiresReconnect ? 409 : 500 },
    )
  }
}
