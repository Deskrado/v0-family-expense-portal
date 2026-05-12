import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))
    const email = String(body.email || "").trim()
    const password = String(body.password || "")

    if (!email || !password) {
      return NextResponse.json({ error: "Ingresá email y contraseña" }, { status: 400 })
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return NextResponse.json({ error: error.message }, { status: 401 })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al iniciar sesión" },
      { status: 500 },
    )
  }
}
