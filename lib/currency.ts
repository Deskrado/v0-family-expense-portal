import { Currency } from './types'

const DEFAULT_CURRENCY: Currency = {
  id: '',
  code: 'ARS',
  name: 'Peso Argentino',
  symbol: '$',
  decimal_separator: ',',
  thousand_separator: '.',
}

export function formatCurrency(
  amount: number,
  currency: Currency | null | undefined = DEFAULT_CURRENCY
): string {
  const curr = currency || DEFAULT_CURRENCY
  const isNegative = amount < 0
  const absAmount = Math.abs(amount)
  
  const parts = absAmount.toFixed(2).split('.')
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, curr.thousand_separator)
  const decimalPart = parts[1]
  
  const formatted = `${curr.symbol}${integerPart}${curr.decimal_separator}${decimalPart}`
  return isNegative ? `-${formatted}` : formatted
}

export function formatCompactCurrency(
  amount: number,
  currency: Currency | null | undefined = DEFAULT_CURRENCY
): string {
  const curr = currency || DEFAULT_CURRENCY
  const isNegative = amount < 0
  const absAmount = Math.abs(amount)
  
  let formatted: string
  if (absAmount >= 1000000) {
    formatted = `${curr.symbol}${(absAmount / 1000000).toFixed(1)}M`
  } else if (absAmount >= 1000) {
    formatted = `${curr.symbol}${(absAmount / 1000).toFixed(1)}K`
  } else {
    formatted = `${curr.symbol}${absAmount.toFixed(0)}`
  }
  
  return isNegative ? `-${formatted}` : formatted
}

export function parseCurrencyInput(value: string): number {
  // Remove currency symbols and spaces
  let cleaned = value.replace(/[^0-9,.-]/g, '')
  // Handle both . and , as decimal separators
  // Assume last separator is decimal if there are 2 digits after it
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  
  if (lastComma > lastDot && cleaned.length - lastComma <= 3) {
    // Comma is decimal separator
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma && cleaned.length - lastDot <= 3) {
    // Dot is decimal separator
    cleaned = cleaned.replace(/,/g, '')
  } else {
    // No decimal separator, remove all separators
    cleaned = cleaned.replace(/[,.]/g, '')
  }
  
  return parseFloat(cleaned) || 0
}

export function getMonthName(month: number, short = false): string {
  const months = short 
    ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    : ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return months[month - 1] || ''
}

export function getCurrentMonth(): number {
  return new Date().getMonth() + 1
}

export function getCurrentYear(): number {
  return new Date().getFullYear()
}

export function getMonthRange(month: number, year: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
  return { start, end }
}
