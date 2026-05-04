type IolTokenResponse = {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export type IolSecret = IolTokenResponse & {
  obtained_at: string
  base_url: string
}

export async function loginToIol(input: {
  username: string
  password: string
  baseUrl: string
}) {
  const body = new URLSearchParams({
    username: input.username,
    password: input.password,
    grant_type: "password",
  })

  const response = await fetch(`${input.baseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`IOL rechazo el login (${response.status})`)
  }

  return response.json() as Promise<IolTokenResponse>
}

export async function refreshIolToken(input: {
  refreshToken: string
  baseUrl: string
}) {
  const body = new URLSearchParams({
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
  })

  const response = await fetch(`${input.baseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`IOL rechazo el refresh token (${response.status})`)
  }

  return response.json() as Promise<IolTokenResponse>
}

export async function getIolJson<T>(baseUrl: string, accessToken: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`IOL ${path} respondio ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function fetchIolReadOnlyData(baseUrl: string, accessToken: string) {
  const results: Record<string, unknown> = {}

  const endpoints = [
    ["accountStatus", "/api/v2/estadocuenta"],
    ["portfolioArgentina", "/api/v2/portafolio/Argentina"],
    ["portfolioLegacy", "/api/micuenta/miportafolio"],
  ] as const

  for (const [key, path] of endpoints) {
    try {
      results[key] = await getIolJson(baseUrl, accessToken, path)
    } catch (error) {
      results[`${key}Error`] = error instanceof Error ? error.message : "Error desconocido"
    }
  }

  return results
}

function findArrays(value: unknown): unknown[][] {
  if (Array.isArray(value)) return [value, ...value.flatMap(findArrays)]
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(findArrays)
  }
  return []
}

export function parseIolPositions(raw: Record<string, unknown>) {
  const arrays = findArrays(raw)
  const candidates = arrays
    .filter((items) => items.length > 0 && items.every((item) => item && typeof item === "object"))
    .sort((a, b) => b.length - a.length)

  const source = candidates[0] || []

  return source.map((item) => {
    const row = item as Record<string, unknown>
    const symbol = String(row.simbolo || row.ticker || row.symbol || row.descripcion || "SIN-TICKER")
    const quantity = Number(row.cantidad || row.nominales || row.quantity || row.tenencia || 0)
    const price = Number(row.cotizacion || row.precio || row.lastPrice || row.price || 0)
    const marketValue = Number(row.valorizado || row.valuacion || row.marketValue || row.valorActual || quantity * price || 0)
    const currencyCode = String(row.moneda || row.currency || "ARS").toUpperCase()

    return {
      symbol,
      name: String(row.descripcion || row.nombre || symbol),
      market: String(row.mercado || row.market || "IOL"),
      instrumentType: String(row.tipo || row.type || "other").toLowerCase(),
      quantity,
      price,
      marketValue,
      currencyCode,
      raw: row,
    }
  })
}
