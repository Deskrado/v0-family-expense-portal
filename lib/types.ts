export interface Currency {
  id: string
  code: string
  name: string
  symbol: string
  decimal_separator: string
  thousand_separator: string
  decimal_places?: number
  is_active?: boolean
}

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  phone?: string | null
  locale: string
  created_at: string
  updated_at: string
}

export interface Family {
  id: string
  name: string
  description?: string | null
  default_currency_id: string | null
  timezone: string
  month_start_day: number
  created_by: string
  created_at: string
  updated_at: string
  default_currency?: Currency | null
}

export interface FamilyMember {
  id: string
  family_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  is_active: boolean
  joined_at: string
  family?: Family
}

export interface Group {
  id: string
  user_id: string
  name: string
  description: string | null
  color: string
  family_id?: string | null
  sort_order?: number
  archived_at?: string | null
  updated_at?: string
  created_at: string
}

export interface Category {
  id: string
  user_id: string
  name: string
  type: 'expense' | 'income'
  color: string
  icon: string | null
  parent_id: string | null
  group_id: string | null
  family_id?: string | null
  sort_order?: number
  is_active?: boolean
  archived_at?: string | null
  updated_at?: string
  created_at: string
  group?: Group
}

export interface CreditCard {
  id: string
  user_id: string
  name: string
  last_four: string | null
  brand: string | null
  credit_limit: number | null
  closing_day: number | null
  due_day: number | null
  currency_id: string | null
  family_id?: string | null
  owner_user_id?: string | null
  notes?: string | null
  is_active: boolean
  updated_at?: string
  created_at: string
  currency?: Currency
}

export interface Transaction {
  id: string
  user_id: string
  description: string
  amount: number
  budgeted_amount: number | null
  currency_id: string | null
  category_id: string | null
  group_id: string | null
  transaction_date: string
  type: 'expense' | 'income'
  is_recurring: boolean
  payment_method: 'cash' | 'debit' | 'credit' | 'transfer' | null
  credit_card_id: string | null
  family_id?: string | null
  created_by?: string | null
  credit_card_purchase_id?: string | null
  installment_number?: number | null
  metadata?: Record<string, unknown>
  archived_at?: string | null
  updated_at?: string
  notes: string | null
  created_at: string
  category?: Category
  group?: Group
  currency?: Currency
  credit_card?: CreditCard
}

export interface CreditCardPurchase {
  id: string
  user_id: string
  credit_card_id: string
  description: string
  total_amount: number
  installment_amount: number
  total_installments: number
  current_installment: number
  start_date: string
  category_id: string | null
  family_id?: string | null
  currency_id?: string | null
  notes?: string | null
  updated_at?: string
  is_active: boolean
  created_at: string
  credit_card?: CreditCard
  category?: Category
}

export interface Budget {
  id: string
  user_id: string
  category_id: string | null
  group_id: string | null
  family_id?: string | null
  notes?: string | null
  updated_at?: string
  month: number
  year: number
  budgeted_amount: number
  currency_id: string | null
  created_at: string
  category?: Category
  group?: Group
  currency?: Currency
}

export interface Investment {
  id: string
  user_id: string
  name: string
  type: 'plazo_fijo' | 'acciones' | 'crypto' | 'fci' | 'bonos' | 'otros'
  initial_amount: number
  current_value: number
  currency_id: string | null
  family_id?: string | null
  created_by?: string | null
  institution?: string | null
  ticker?: string | null
  quantity?: number | null
  updated_at?: string
  start_date: string
  end_date: string | null
  interest_rate: number | null
  notes: string | null
  is_active: boolean
  created_at: string
  currency?: Currency
}

export interface ExternalProvider {
  id: string
  code: string
  name: string
  kind: 'broker' | 'fx' | 'market_data'
  base_url: string
  sandbox_base_url: string | null
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface BrokerConnection {
  id: string
  user_id: string
  family_id: string | null
  provider_id: string
  secret_id: string | null
  display_name: string
  environment: 'sandbox' | 'production'
  status: 'active' | 'reauth_required' | 'disabled' | 'error'
  scopes: string[]
  external_account_hash: string | null
  access_token_expires_at: string | null
  last_sync_at: string | null
  last_error: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  provider?: ExternalProvider | null
}

export interface BrokerAccount {
  id: string
  user_id: string
  connection_id: string
  external_account_id: string | null
  account_number_last4: string | null
  name: string
  base_currency_id: string | null
  status: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  connection?: BrokerConnection | null
  base_currency?: Currency | null
}

export interface MarketInstrument {
  id: string
  provider_id: string | null
  symbol: string
  market: string | null
  country: string | null
  instrument_type: string
  currency_id: string | null
  name: string | null
  provider_symbol: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  currency?: Currency | null
  provider?: ExternalProvider | null
}

export interface BrokerPosition {
  id: string
  user_id: string
  account_id: string
  instrument_id: string | null
  quantity: number
  avg_cost: number | null
  currency_id: string | null
  market_value: number | null
  price: number | null
  observed_at: string
  source: string
  raw: Record<string, unknown>
  created_at: string
  updated_at: string
  account?: BrokerAccount | null
  instrument?: MarketInstrument | null
  currency?: Currency | null
}

export interface PortfolioSnapshot {
  id: string
  user_id: string
  connection_id: string
  account_id: string | null
  snapshot_at: string
  total_value: number
  currency_id: string | null
  source: string
  raw_hash: string | null
  raw: Record<string, unknown>
  created_at: string
  account?: BrokerAccount | null
  currency?: Currency | null
}

export interface FxQuote {
  id: string
  base_currency_id: string
  quote_currency_id: string
  rate_type: string
  bid: number | null
  ask: number | null
  mid: number | null
  source: string
  observed_at: string
  valid_on: string
  raw: Record<string, unknown>
  created_at: string
  base_currency?: Currency | null
  quote_currency?: Currency | null
}

export interface SavingsGoal {
  id: string
  user_id: string
  name: string
  target_amount: number
  current_amount: number
  currency_id: string | null
  target_date: string | null
  monthly_target: number | null
  family_id?: string | null
  created_by?: string | null
  completed_at?: string | null
  notes?: string | null
  updated_at?: string
  is_completed: boolean
  created_at: string
  currency?: Currency
}

export interface ExchangeRate {
  id: string
  from_currency_id: string
  to_currency_id: string
  rate: number
  date: string
  source?: string | null
  created_at: string
}

export interface MonthlySavings {
  id: string
  user_id: string
  family_id?: string | null
  month: number
  year: number
  total_income: number
  total_expenses: number
  savings_amount: number
  currency_id: string | null
  created_at: string
}

export interface UserSettings {
  id: string
  user_id: string
  default_currency_id: string | null
  monthly_savings_target: number
  annual_savings_target: number
  initial_balance: number
  default_payment_method?: 'cash' | 'debit' | 'credit' | 'transfer' | null
  default_transaction_type?: 'expense' | 'income'
  dashboard_months_ahead?: number
  week_starts_on?: number
  date_format?: string
  number_format?: string
  compact_mode?: boolean
  show_archived?: boolean
  notify_card_due_days?: number
  notify_budget_threshold?: number
  auto_create_card_transactions?: boolean
  created_at: string
  updated_at: string
  default_currency?: Currency
}

export interface MonthlySummary {
  totalIncome: number
  totalExpenses: number
  budgetedIncome: number
  budgetedExpenses: number
  savings: number
  savingsRate: number
}

export interface GroupSummary {
  group: Group | null
  budgeted: number
  actual: number
  difference: number
  categories: CategorySummary[]
}

export interface CategorySummary {
  category: Category
  budgeted: number
  actual: number
  difference: number
}
