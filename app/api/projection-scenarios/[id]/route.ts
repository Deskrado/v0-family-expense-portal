import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { id } = await context.params
    const body = await request.json().catch(() => ({}))
    const payload: Record<string, unknown> = {}

    if (typeof body.name === "string") payload.name = body.name.trim()
    if (typeof body.description === "string") payload.description = body.description.trim() || null
    if (typeof body.isActive === "boolean") payload.is_active = body.isActive

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "No hay cambios para guardar" }, { status: 400 })
    }
    if (payload.name === "") return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 })

    const { data, error } = await supabase
      .from("projection_scenarios")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single()

    if (error) throw error
    return NextResponse.json({ scenario: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al actualizar escenario" },
      { status: 500 },
    )
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { id } = await context.params
    const { error } = await supabase
      .from("projection_scenarios")
      .delete()
      .eq("id", id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al eliminar escenario" },
      { status: 500 },
    )
  }
}
