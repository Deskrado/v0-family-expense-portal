export type DolarApiQuote = {
  casa: string
  nombre: string
  compra: number
  venta: number
  moneda: string
  fechaActualizacion: string
}

export async function fetchDolarApiQuotes() {
  const response = await fetch("https://dolarapi.com/v1/dolares", { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`DolarAPI respondio ${response.status}`)
  }
  return response.json() as Promise<DolarApiQuote[]>
}
