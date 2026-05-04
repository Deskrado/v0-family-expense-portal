"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { TransactionForm } from "@/components/transactions/transaction-form"
import { Loader2 } from "lucide-react"
import type { Transaction } from "@/lib/types"

export default function EditGastoPage() {
  const params = useParams()
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadTransaction() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", params.id)
        .single()

      if (!error && data) {
        setTransaction(data)
      }
      setLoading(false)
    }
    loadTransaction()
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!transaction) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Gasto no encontrado
      </div>
    )
  }

  return (
    <TransactionForm
      type="expense"
      initialData={{
        id: transaction.id,
        description: transaction.description,
        amount: Number(transaction.amount),
        budgeted_amount: transaction.budgeted_amount ? Number(transaction.budgeted_amount) : undefined,
        currency_id: transaction.currency_id || "",
        category_id: transaction.category_id || "",
        group_id: transaction.group_id || "",
        transaction_date: transaction.transaction_date,
        payment_method: transaction.payment_method as "cash" | "debit" | "credit" | "transfer" | undefined,
        is_recurring: transaction.is_recurring || false,
        notes: transaction.notes || "",
      }}
    />
  )
}
