"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { CreditCardPurchaseForm } from "@/components/credit-cards/credit-card-purchase-form"
import { Loader2 } from "lucide-react"
import type { CreditCardPurchase } from "@/lib/types"

export default function EditCompraTarjetaPage() {
  const params = useParams()
  const [purchase, setPurchase] = useState<CreditCardPurchase | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadPurchase() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("credit_card_purchases")
        .select("*")
        .eq("id", params.id)
        .single()

      if (!error && data) {
        setPurchase(data)
      }
      setLoading(false)
    }

    loadPurchase()
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!purchase) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Compra no encontrada
      </div>
    )
  }

  return <CreditCardPurchaseForm initialData={purchase} />
}
