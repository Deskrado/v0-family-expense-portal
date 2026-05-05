import type { BrokerPosition, Currency, FxQuote, Investment, PortfolioSnapshot, SavingsGoal } from "@/lib/types"

export type WealthBreakdown = {
  cash: number
  investments: number
  foreignCurrencies: number
  total: number
}

function getLatestFxRate(quotes: FxQuote[] | undefined, fromCode: string, toCode: string) {
  if (fromCode === toCode) return 1
  const directQuote = (quotes || []).find((item) =>
    item.base_currency?.code === fromCode &&
    item.quote_currency?.code === toCode
  )
  if (directQuote) return Number(directQuote.ask || directQuote.mid || directQuote.bid || 0) || null

  const inverseQuote = (quotes || []).find((item) =>
    item.base_currency?.code === toCode &&
    item.quote_currency?.code === fromCode
  )
  const inverseRate = inverseQuote ? Number(inverseQuote.bid || inverseQuote.mid || inverseQuote.ask || 0) : 0
  return inverseRate ? 1 / inverseRate : null
}

export function convertToCurrency(
  amount: number,
  from: Currency | null | undefined,
  to: Currency | null | undefined,
  quotes: FxQuote[] | undefined,
) {
  const fromCode = from?.code || to?.code || "ARS"
  const toCode = to?.code || fromCode
  const rate = getLatestFxRate(quotes, fromCode, toCode)
  return rate ? amount * rate : amount
}

type WealthBreakdownInput = {
  cashBalance: number
  investments?: Investment[]
  brokerPositions?: BrokerPosition[]
  portfolioSnapshots?: PortfolioSnapshot[]
  savingsGoals?: SavingsGoal[]
  fxQuotes?: FxQuote[]
  defaultCurrency: Currency | null | undefined
}

export function getWealthBreakdown({
  cashBalance,
  investments,
  brokerPositions,
  portfolioSnapshots,
  savingsGoals,
  fxQuotes,
  defaultCurrency,
}: WealthBreakdownInput): WealthBreakdown {
  const manualInvestments = (investments || [])
    .filter((investment) => investment.is_active)
    .reduce(
      (total, investment) =>
        total + convertToCurrency(Number(investment.current_value || 0), investment.currency, defaultCurrency, fxQuotes),
      0,
    )

  const connectedPositions = (brokerPositions || []).reduce(
    (total, position) =>
      total + convertToCurrency(Number(position.market_value || 0), position.currency, defaultCurrency, fxQuotes),
    0,
  )
  const latestSnapshot = portfolioSnapshots?.[0]
  const snapshotFallback = connectedPositions > 0 || !latestSnapshot
    ? 0
    : convertToCurrency(Number(latestSnapshot.total_value || 0), latestSnapshot.currency, defaultCurrency, fxQuotes)

  const foreignCurrencies = (savingsGoals || [])
    .filter((goal) => !goal.is_completed && Number(goal.current_amount) > 0 && goal.currency?.code !== defaultCurrency?.code)
    .reduce(
      (total, goal) =>
        total + convertToCurrency(Number(goal.current_amount || 0), goal.currency, defaultCurrency, fxQuotes),
      0,
    )

  const investmentsTotal = manualInvestments + connectedPositions + snapshotFallback
  const total = cashBalance + investmentsTotal + foreignCurrencies

  return {
    cash: cashBalance,
    investments: investmentsTotal,
    foreignCurrencies,
    total,
  }
}
