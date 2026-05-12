import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { id } = await context.params
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
      return NextResponse.json({ error: "Periodo inválido" }, { status: 400 })
    }
    if ((endYear * 12 + endMonth) < (startYear * 12 + startMonth)) {
      return NextResponse.json({ error: "El fin no puede ser anterior al inicio" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("projection_scenario_items")
      .insert({
        scenario_id: id,
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
      .select("*")
      .single()

    if (error) throw error
    return NextResponse.json({ item: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al crear ítem de escenario" },
      { status: 500 },
    )
  }
}
