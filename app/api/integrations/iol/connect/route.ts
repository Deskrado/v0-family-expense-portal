import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { encryptJson } from "@/lib/integrations/crypto"
import { loginToIol } from "@/lib/integrations/providers/iol"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const body = await request.json()
    const username = String(body.username || "")
    const password = String(body.password || "")
    const environment = body.environment === "production" ? "production" : "sandbox"
    const displayName = String(body.displayName || "IOL read-only")

    if (!username || !password) {
      return NextResponse.json({ error: "Usuario y password de IOL son requeridos" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: provider, error: providerError } = await admin
      .from("external_providers")
      .select("*")
      .eq("code", "iol")
      .single()

    if (providerError) throw providerError

    const baseUrl = environment === "sandbox"
      ? provider.sandbox_base_url || provider.base_url
      : provider.base_url

    const token = await loginToIol({ username, password, baseUrl })
    const encrypted = encryptJson({
      ...token,
      obtained_at: new Date().toISOString(),
      base_url: baseUrl,
    })

    const { data: secret, error: secretError } = await admin
      .from("integration_secrets")
      .insert({
        provider_code: "iol",
        ...encrypted,
      })
      .select("id")
      .single()

    if (secretError) throw secretError

    const expiresAt = new Date(Date.now() + Number(token.expires_in || 900) * 1000).toISOString()
    const { data: connection, error: connectionError } = await admin
      .from("broker_connections")
      .insert({
        user_id: user.id,
        provider_id: provider.id,
        secret_id: secret.id,
        display_name: displayName,
        environment,
        status: "active",
        access_token_expires_at: expiresAt,
        metadata: { mode: "read_only" },
      })
      .select("*, provider:external_providers(*)")
      .single()

    if (connectionError) throw connectionError

    await admin.from("integration_audit_events").insert({
      user_id: user.id,
      connection_id: connection.id,
      event_type: "iol_connect",
      status: "success",
      message: "Conexion IOL read-only creada",
    })

    return NextResponse.json({ connection })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al conectar IOL" },
      { status: 500 },
    )
  }
}
