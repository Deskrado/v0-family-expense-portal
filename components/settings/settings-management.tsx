"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCurrencies, useUserSettings } from "@/components/dashboard/use-dashboard-data"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Save } from "lucide-react"
import { mutate } from "swr"

export function SettingsManagement() {
  const { data: settings, isLoading } = useUserSettings()
  const { data: currencies } = useCurrencies()
  const [email, setEmail] = useState("")
  const [form, setForm] = useState({
    default_currency_id: "",
    monthly_savings_target: "0",
    annual_savings_target: "0",
    initial_balance: "0",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setEmail(user?.email || "")
    }
    loadUser()
  }, [])

  useEffect(() => {
    const defaultCurrencyId = currencies?.find((currency) => currency.code === "ARS")?.id || currencies?.[0]?.id || ""
    setForm({
      default_currency_id: settings?.default_currency_id || defaultCurrencyId,
      monthly_savings_target: settings?.monthly_savings_target?.toString() || "0",
      annual_savings_target: settings?.annual_savings_target?.toString() || "0",
      initial_balance: settings?.initial_balance?.toString() || "0",
    })
  }, [currencies, settings])

  const saveSettings = async () => {
    setIsSubmitting(true)
    setMessage(null)

    try {
      if (Number(form.monthly_savings_target) < 0 || Number(form.annual_savings_target) < 0) {
        throw new Error("Las metas de ahorro no pueden ser negativas")
      }
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No estas autenticado")

      const { error } = await supabase
        .from("user_settings")
        .upsert({
          user_id: user.id,
          default_currency_id: form.default_currency_id || null,
          monthly_savings_target: Number(form.monthly_savings_target) || 0,
          annual_savings_target: Number(form.annual_savings_target) || 0,
          initial_balance: Number(form.initial_balance) || 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" })

      if (error) throw error

      mutate("user-settings")
      setMessage("Configuracion guardada")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Configuracion financiera</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <div className="rounded-md border bg-muted p-3 text-sm">{message}</div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Moneda base</Label>
              <Select value={form.default_currency_id} onValueChange={(value) => setForm({ ...form, default_currency_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar moneda" />
                </SelectTrigger>
                <SelectContent>
                  {currencies?.map((currency) => (
                    <SelectItem key={currency.id} value={currency.id}>
                      {currency.code} ({currency.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Saldo inicial</Label>
              <Input type="number" step="0.01" value={form.initial_balance} onChange={(event) => setForm({ ...form, initial_balance: event.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Meta mensual de ahorro</Label>
              <Input type="number" step="0.01" value={form.monthly_savings_target} onChange={(event) => setForm({ ...form, monthly_savings_target: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Meta anual de ahorro</Label>
              <Input type="number" step="0.01" value={form.annual_savings_target} onChange={(event) => setForm({ ...form, annual_savings_target: event.target.value })} />
            </div>
          </div>

          <Button onClick={saveSettings} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cuenta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium">{email || "Usuario autenticado"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Supabase Auth</p>
            <p className="font-medium">Activo</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
