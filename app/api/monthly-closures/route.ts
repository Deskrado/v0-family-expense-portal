import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

async function getDefaultFamilyId(userId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.family_id || null
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const year = Number(request.nextUrl.searchParams.get("year") || new Date().getFullYear())
    let query = supabase
      .from("monthly_closures")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false })

    if (Number.isFinite(year)) query = query.eq("year", year)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ closures: data || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al obtener cierres" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const year = Number(body.year)
    const month = Number(body.month)
    const familyId = body.familyId === null ? null : String(body.familyId || await getDefaultFamilyId(user.id) || "")

    if (month < 1 || month > 12 || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Periodo inválido" }, { status: 400 })
    }

    const payload = {
      user_id: user.id,
      family_id: familyId || null,
      year,
      month,
      income_total: Number(body.incomeTotal || 0),
      expense_total: Number(body.expenseTotal || 0),
      savings_total: Number(body.savingsTotal || 0),
      cash_total: Number(body.cashTotal || 0),
      investments_total: Number(body.investmentsTotal || 0),
      foreign_currency_total: Number(body.foreignCurrencyTotal || 0),
      snapshot: body.snapshot && typeof body.snapshot === "object" ? body.snapshot : {},
      closed_by: user.id,
      closed_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from("monthly_closures")
      .upsert(payload, { onConflict: "user_id,year,month" })
      .select("*")
      .single()

    if (error) throw error
    return NextResponse.json({ closure: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al cerrar mes" },
      { status: 500 },
    )
  }
}
