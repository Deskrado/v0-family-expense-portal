import { describe, expect, it } from "vitest"
import { buildProjectionSearchParams, parseProjectionPeriod } from "@/lib/projection-url-state"

describe("projection URL state", () => {
  it("acepta períodos válidos y rechaza fechas fuera de rango", () => {
    expect(parseProjectionPeriod("2026-08")).toEqual({ year: 2026, month: 8 })
    expect(parseProjectionPeriod("2026-13")).toBeNull()
    expect(parseProjectionPeriod("26-08")).toBeNull()
    expect(parseProjectionPeriod("1999-12")).toBeNull()
  })

  it("conserva parámetros ajenos y elimina filtros generales", () => {
    const query = buildProjectionSearchParams("source=shared&category=old&group=old", {
      categoryId: "__all",
      comparisonEnabled: true,
      groupId: "__all",
      month: 2,
      rangeMode: "trailing",
      year: 2025,
    })
    const params = new URLSearchParams(query)

    expect(params.get("source")).toBe("shared")
    expect(params.get("period")).toBe("2025-02")
    expect(params.get("window")).toBe("trailing")
    expect(params.get("compare")).toBe("previous")
    expect(params.has("category")).toBe(false)
    expect(params.has("group")).toBe(false)
  })
})
