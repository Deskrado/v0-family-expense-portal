import type { CreditCard } from "@/lib/types"
import { cn } from "@/lib/utils"

export const CARD_BRANDS = [
  { value: "__none", label: "Sin marca" },
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "amex", label: "American Express" },
  { value: "other", label: "Otra" },
] as const

export type CardBrandValue = (typeof CARD_BRANDS)[number]["value"]

export function normalizeCardBrand(brand: string | null | undefined): CardBrandValue {
  const value = String(brand || "").trim().toLowerCase()
  const compact = value.replace(/[\s_-]/g, "")
  if (!compact) return "__none"
  if (compact.includes("visa")) return "visa"
  if (compact.includes("master") || compact === "mc") return "mastercard"
  if (compact.includes("amex") || compact.includes("americanexpress")) return "amex"
  if (compact.includes("otra") || compact.includes("other")) return "other"
  return "other"
}

export function getCardBrandLabel(brand: string | null | undefined) {
  const normalized = normalizeCardBrand(brand)
  return CARD_BRANDS.find((item) => item.value === normalized)?.label || "Sin marca"
}

export function CardBrandMark({
  brand,
  className,
}: {
  brand: string | null | undefined
  className?: string
}) {
  const normalized = normalizeCardBrand(brand)

  if (normalized === "mastercard") {
    return (
      <span
        aria-hidden="true"
        className={cn("relative inline-flex h-5 w-8 shrink-0 items-center justify-center", className)}
      >
        <span className="absolute left-1 h-4 w-4 rounded-full bg-[#eb001b]" />
        <span className="absolute right-1 h-4 w-4 rounded-full bg-[#f79e1b] mix-blend-multiply" />
      </span>
    )
  }

  const styles: Record<CardBrandValue, string> = {
    "__none": "border-border bg-muted text-muted-foreground",
    visa: "border-[#1a1f71] bg-[#1a1f71] text-white",
    mastercard: "border-transparent bg-transparent text-transparent",
    amex: "border-[#2e77bb] bg-[#2e77bb] text-white",
    other: "border-border bg-muted text-muted-foreground",
  }
  const text: Record<CardBrandValue, string> = {
    "__none": "CARD",
    visa: "VISA",
    mastercard: "MC",
    amex: "AMEX",
    other: "CARD",
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-5 min-w-8 shrink-0 items-center justify-center rounded border px-1 text-[10px] font-bold leading-none tracking-normal",
        styles[normalized],
        className,
      )}
    >
      {text[normalized]}
    </span>
  )
}

export function CreditCardSelectLabel({
  card,
  className,
}: {
  card: Pick<CreditCard, "name" | "brand" | "last_four">
  className?: string
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <CardBrandMark brand={card.brand} />
      <span className="truncate">{card.name}</span>
      {card.last_four && <span className="shrink-0 text-muted-foreground">**** {card.last_four}</span>}
    </span>
  )
}
