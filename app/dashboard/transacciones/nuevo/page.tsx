import { TransactionForm } from "@/components/transactions/transaction-form"

interface NuevaTransaccionPageProps {
  searchParams: Promise<{ type?: string }>
}

export default async function NuevaTransaccionPage({ searchParams }: NuevaTransaccionPageProps) {
  const params = await searchParams
  const requestedType = params.type
  const type = requestedType === "income" ? "income" : "expense"

  return (
    <TransactionForm
      type={type}
      backUrl="/dashboard/transacciones"
      redirectUrl="/dashboard/transacciones"
    />
  )
}
