export type ProjectionUrlState = {
  categoryId: string
  comparisonEnabled: boolean
  groupId: string
  month: number
  rangeMode: "trailing" | "forward"
  year: number
}

export function parseProjectionPeriod(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 ? { year, month } : null
}

export function buildProjectionSearchParams(currentQuery: string, state: ProjectionUrlState) {
  const params = new URLSearchParams(currentQuery)
  params.set("period", `${state.year}-${String(state.month).padStart(2, "0")}`)
  params.set("window", state.rangeMode)
  params.set("compare", state.comparisonEnabled ? "previous" : "none")
  if (state.categoryId === "__all") params.delete("category")
  else params.set("category", state.categoryId)
  if (state.groupId === "__all") params.delete("group")
  else params.set("group", state.groupId)
  return params.toString()
}
