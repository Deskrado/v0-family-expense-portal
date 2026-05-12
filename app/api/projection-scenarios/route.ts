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

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { data, error } = await supabase
      .from("projection_scenarios")
      .select(`
        *,
        items:projection_scenario_items(
          *,
          currency:currencies(*),
          category:categories(*),
          group:groups(*)
        )
      `)
      .order("created_at", { ascending: false })

    if (error) throw error
    return NextResponse.json({ scenarios: data || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al obtener escenarios" },
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
    const name = String(body.name || "").trim()
    const description = String(body.description || "").trim()
    const familyId = body.familyId === null ? null : String(body.familyId || await getDefaultFamilyId(user.id) || "")

    if (!name) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 })

    const { data, error } = await supabase
      .from("projection_scenarios")
      .insert({
        user_id: user.id,
        family_id: familyId || null,
        name,
        description: description || null,
        is_active: body.isActive !== false,
      })
      .select("*")
      .single()

    if (error) throw error
    return NextResponse.json({ scenario: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al crear escenario" },
      { status: 500 },
    )
  }
}
