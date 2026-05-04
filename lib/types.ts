export interface Currency {
  id: string
  code: string
  name: string
  symbol: string
  decimal_separator: string
  thousand_separator: string
}

export interface Group {
  id: string
  user_id: string
  name: string
  description: string | null
  color: string
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
  is_active: boolean
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
  start_date: string
  end_date: string | null
  interest_rate: number | null
  notes: string | null
  is_active: boolean
  created_at: string
  currency?: Currency
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
  created_at: string
}

export interface MonthlySavings {
  id: string
  user_id: string
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
