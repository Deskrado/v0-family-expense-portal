export function getMonthIndexFromDateOnly(value: string | null | undefined) {
  if (!value) return -1
  const month = Number(value.slice(5, 7))
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month - 1 : -1
}

export function getYearFromDateOnly(value: string | null | undefined) {
  if (!value) return 0
  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) ? year : 0
}

export function dateOnlyToLocalDate(value: string | null | undefined) {
  if (!value) return null
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  return new Date(year, month - 1, day)
}
