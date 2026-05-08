import { TransactionForm } from "@/components/transactions/transaction-form"

interface NuevaTransaccionPageProps {
  searchParams: Promise<{
    type?: string
    payment?: string
    recurring?: string
    cardId?: string
    back?: string
    redirect?: string
  }>
}

export default async function NuevaTransaccionPage({ searchParams }: NuevaTransaccionPageProps) {
  const params = await searchParams
  const requestedType = params.type
  const type = requestedType === "income" ? "income" : "expense"
  const paymentMethod = params.payment === "credit" ? "credit" : undefined
  const isRecurring = params.recurring === "1" || params.recurring === "true"
  const safeBackUrl = params.back?.startsWith("/dashboard") ? params.back : "/dashboard/transacciones"
  const safeRedirectUrl = params.redirect?.startsWith("/dashboard") ? params.redirect : "/dashboard/transacciones"

  return (
    <TransactionForm
      type={type}
      initialData={{
        payment_method: paymentMethod,
        credit_card_id: params.cardId || undefined,
        is_recurring: isRecurring,
      }}
      backUrl={safeBackUrl}
      redirectUrl={safeRedirectUrl}
    />
  )
}
