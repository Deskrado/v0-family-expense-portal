import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type RouteContext = {
  params: Promise<{ id: string; itemId: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { id, itemId } = await context.params
    const body = await request.json().catch(() => ({}))
    const name = String(body.name || "").trim()
    const amount = Number(body.amount)
    const frequency = body.frequency === "one_time" ? "one_time" : "monthly"
    const startMonth = Number(body.startMonth)
    const startYear = Number(body.startYear)
    const endMonth = frequency === "one_time" ? startMonth : Number(body.endMonth)
    const endYear = frequency === "one_time" ? startYear : Number(body.endYear)

    if (!name) return NextResponse.json({ error: "El concepto es requerido" }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
    if (startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12 || startYear < 2000 || endYear < 2000) {
      return NextResponse.json({ error: "Periodo invalido" }, { status: 400 })
    }
    if ((endYear * 12 + endMonth) < (startYear * 12 + startMonth)) {
      return NextResponse.json({ error: "El fin no puede ser anterior al inicio" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("projection_scenario_items")
      .update({
        name,
        amount,
        currency_id: body.currencyId || null,
        frequency,
        start_month: startMonth,
        start_year: startYear,
        end_month: endMonth,
        end_year: endYear,
        category_id: body.categoryId || null,
        group_id: body.groupId || null,
      })
      .eq("id", itemId)
      .eq("scenario_id", id)
      .select("*")
      .single()

    if (error) throw error
    return NextResponse.json({ item: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al actualizar item" },
      { status: 500 },
    )
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { itemId } = await context.params
    const { error } = await supabase
      .from("projection_scenario_items")
      .delete()
      .eq("id", itemId)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al eliminar ítem" },
      { status: 500 },
    )
  }
}
