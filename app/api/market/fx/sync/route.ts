import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fetchDolarApiQuotes } from "@/lib/integrations/fx/dolarapi"

async function isAllowed(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return !!user
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAllowed(request))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const admin = createAdminClient()
    const [quotes, currencies] = await Promise.all([
      fetchDolarApiQuotes(),
      admin.from("currencies").select("*").in("code", ["USD", "ARS"]),
    ])

    if (currencies.error) throw currencies.error
    const usd = currencies.data.find((currency) => currency.code === "USD")
    const ars = currencies.data.find((currency) => currency.code === "ARS")
    if (!usd || !ars) throw new Error("Faltan monedas USD/ARS")

    for (const quote of quotes) {
      const observedAt = quote.fechaActualizacion ? new Date(quote.fechaActualizacion).toISOString() : new Date().toISOString()
      await admin.from("fx_quotes").upsert({
        base_currency_id: usd.id,
        quote_currency_id: ars.id,
        rate_type: quote.casa,
        bid: quote.compra || null,
        ask: quote.venta || null,
        mid: quote.compra && quote.venta ? (Number(quote.compra) + Number(quote.venta)) / 2 : quote.venta || quote.compra || null,
        source: "dolarapi",
        observed_at: observedAt,
        valid_on: observedAt.slice(0, 10),
        raw: quote,
      }, { onConflict: "source,rate_type,observed_at" })
    }

    return NextResponse.json({ ok: true, quotes: quotes.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al sincronizar FX" },
      { status: 500 },
    )
  }
}
