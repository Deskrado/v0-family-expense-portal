"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCurrencies, useUserSettings } from "@/components/dashboard/use-dashboard-data"
import type { FamilyMember, Profile } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
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
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Save } from "lucide-react"
import { mutate } from "swr"

type SettingsForm = {
  default_currency_id: string
  initial_balance: string
  monthly_savings_target: string
  annual_savings_target: string
  default_payment_method: string
  default_transaction_type: "expense" | "income"
  dashboard_months_ahead: string
  week_starts_on: string
  date_format: string
  number_format: string
  compact_mode: boolean
  show_archived: boolean
  notify_card_due_days: string
  notify_budget_threshold: string
  auto_create_card_transactions: boolean
}

type ProfileForm = {
  full_name: string
  phone: string
  locale: string
}

type FamilyForm = {
  id: string
  name: string
  description: string
  default_currency_id: string
  timezone: string
  month_start_day: string
}

const defaultSettingsForm: SettingsForm = {
  default_currency_id: "",
  initial_balance: "0",
  monthly_savings_target: "0",
  annual_savings_target: "0",
  default_payment_method: "__none",
  default_transaction_type: "expense",
  dashboard_months_ahead: "6",
  week_starts_on: "1",
  date_format: "dd/MM/yyyy",
  number_format: "es-AR",
  compact_mode: false,
  show_archived: false,
  notify_card_due_days: "3",
  notify_budget_threshold: "80",
  auto_create_card_transactions: false,
}

const defaultProfileForm: ProfileForm = {
  full_name: "",
  phone: "",
  locale: "es-AR",
}

const defaultFamilyForm: FamilyForm = {
  id: "",
  name: "",
  description: "",
  default_currency_id: "",
  timezone: "America/Argentina/Buenos_Aires",
  month_start_day: "1",
}

export function SettingsManagement() {
  const supabase = useMemo(() => createClient(), [])
  const { data: settings, isLoading } = useUserSettings()
  const { data: currencies } = useCurrencies()
  const [userId, setUserId] = useState("")
  const [email, setEmail] = useState("")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [profileForm, setProfileForm] = useState<ProfileForm>(defaultProfileForm)
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(defaultSettingsForm)
  const [familyForm, setFamilyForm] = useState<FamilyForm>(defaultFamilyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const defaultCurrencyId = settings?.default_currency_id || currencies?.find((currency) => currency.code === "ARS")?.id || currencies?.[0]?.id || ""
  const activeMembership = familyMembers.find((member) => member.is_active) || null

  useEffect(() => {
    async function loadUserContext() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserId(user.id)
      setEmail(user.email || "")

      const [{ data: profileData }, { data: membershipsData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase
          .from("family_members")
          .select("*, family:families(*, default_currency:currencies(*))")
          .eq("user_id", user.id)
          .order("joined_at", { ascending: true }),
      ])

      setProfile(profileData || null)
      setProfileForm({
        full_name: profileData?.full_name || "",
        phone: profileData?.phone || "",
        locale: profileData?.locale || "es-AR",
      })
      setFamilyMembers((membershipsData as FamilyMember[]) || [])
    }

    loadUserContext()
  }, [supabase])

  useEffect(() => {
    setSettingsForm({
      default_currency_id: settings?.default_currency_id || defaultCurrencyId,
      initial_balance: settings?.initial_balance?.toString() || "0",
      monthly_savings_target: settings?.monthly_savings_target?.toString() || "0",
      annual_savings_target: settings?.annual_savings_target?.toString() || "0",
      default_payment_method: settings?.default_payment_method || "__none",
      default_transaction_type: settings?.default_transaction_type || "expense",
      dashboard_months_ahead: settings?.dashboard_months_ahead?.toString() || "6",
      week_starts_on: settings?.week_starts_on?.toString() || "1",
      date_format: settings?.date_format || "dd/MM/yyyy",
      number_format: settings?.number_format || "es-AR",
      compact_mode: settings?.compact_mode || false,
      show_archived: settings?.show_archived || false,
      notify_card_due_days: settings?.notify_card_due_days?.toString() || "3",
      notify_budget_threshold: settings?.notify_budget_threshold?.toString() || "80",
      auto_create_card_transactions: settings?.auto_create_card_transactions || false,
    })
  }, [defaultCurrencyId, settings])

  useEffect(() => {
    const family = activeMembership?.family
    setFamilyForm({
      id: family?.id || "",
      name: family?.name || "",
      description: family?.description || "",
      default_currency_id: family?.default_currency_id || defaultCurrencyId,
      timezone: family?.timezone || "America/Argentina/Buenos_Aires",
      month_start_day: family?.month_start_day?.toString() || "1",
    })
  }, [activeMembership, defaultCurrencyId])

  const reloadFamilyMembers = async () => {
    if (!userId) return
    const { data } = await supabase
      .from("family_members")
      .select("*, family:families(*, default_currency:currencies(*))")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true })
    setFamilyMembers((data as FamilyMember[]) || [])
  }

  const saveProfile = async () => {
    setIsSubmitting(true)
    setMessage(null)

    try {
      if (!userId) throw new Error("No estas autenticado")

      const { data, error } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          full_name: profileForm.full_name.trim() || null,
          phone: profileForm.phone.trim() || null,
          locale: profileForm.locale,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single()

      if (error) throw error
      setProfile(data)
      setMessage("Perfil guardado")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al guardar perfil")
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveSettings = async () => {
    setIsSubmitting(true)
    setMessage(null)

    try {
      if (!userId) throw new Error("No estas autenticado")

      const monthlyTarget = Number(settingsForm.monthly_savings_target)
      const annualTarget = Number(settingsForm.annual_savings_target)
      const monthsAhead = Number(settingsForm.dashboard_months_ahead)
      const cardDueDays = Number(settingsForm.notify_card_due_days)
      const budgetThreshold = Number(settingsForm.notify_budget_threshold)
      const weekStartsOn = Number(settingsForm.week_starts_on)

      if (monthlyTarget < 0 || annualTarget < 0) throw new Error("Las metas de ahorro no pueden ser negativas")
      if (monthsAhead < 1 || monthsAhead > 24) throw new Error("La proyeccion debe estar entre 1 y 24 meses")
      if (cardDueDays < 0 || cardDueDays > 31) throw new Error("Los dias de aviso de tarjeta deben estar entre 0 y 31")
      if (budgetThreshold < 0 || budgetThreshold > 100) throw new Error("El umbral de presupuesto debe estar entre 0 y 100")
      if (weekStartsOn < 0 || weekStartsOn > 6) throw new Error("El inicio de semana no es valido")

      const { error } = await supabase
        .from("user_settings")
        .upsert({
          user_id: userId,
          default_currency_id: settingsForm.default_currency_id || null,
          monthly_savings_target: monthlyTarget || 0,
          annual_savings_target: annualTarget || 0,
          initial_balance: Number(settingsForm.initial_balance) || 0,
          default_payment_method: settingsForm.default_payment_method === "__none" ? null : settingsForm.default_payment_method,
          default_transaction_type: settingsForm.default_transaction_type,
          dashboard_months_ahead: monthsAhead,
          week_starts_on: weekStartsOn,
          date_format: settingsForm.date_format,
          number_format: settingsForm.number_format,
          compact_mode: settingsForm.compact_mode,
          show_archived: settingsForm.show_archived,
          notify_card_due_days: cardDueDays,
          notify_budget_threshold: budgetThreshold,
          auto_create_card_transactions: settingsForm.auto_create_card_transactions,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" })

      if (error) throw error
      mutate("user-settings")
      setMessage("Preferencias guardadas")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al guardar preferencias")
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveFamily = async () => {
    setIsSubmitting(true)
    setMessage(null)

    try {
      if (!userId) throw new Error("No estas autenticado")
      if (!familyForm.name.trim()) throw new Error("El nombre del hogar es requerido")
      const monthStartDay = Number(familyForm.month_start_day)
      if (monthStartDay < 1 || monthStartDay > 28) throw new Error("El dia de inicio mensual debe estar entre 1 y 28")

      if (familyForm.id) {
        const { error } = await supabase
          .from("families")
          .update({
            name: familyForm.name.trim(),
            description: familyForm.description.trim() || null,
            default_currency_id: familyForm.default_currency_id || null,
            timezone: familyForm.timezone,
            month_start_day: monthStartDay,
            updated_at: new Date().toISOString(),
          })
          .eq("id", familyForm.id)

        if (error) throw error
      } else {
        const { data: family, error } = await supabase
          .from("families")
          .insert({
            name: familyForm.name.trim(),
            description: familyForm.description.trim() || null,
            default_currency_id: familyForm.default_currency_id || null,
            timezone: familyForm.timezone,
            month_start_day: monthStartDay,
            created_by: userId,
          })
          .select("*")
          .single()

        if (error) throw error

        const { error: memberError } = await supabase
          .from("family_members")
          .insert({
            family_id: family.id,
            user_id: userId,
            role: "owner",
            is_active: true,
          })

        if (memberError) throw memberError
      }

      await reloadFamilyMembers()
      setMessage("Hogar guardado")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al guardar hogar")
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
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Configuracion</h2>
        <p className="text-sm text-muted-foreground">Preferencias personales, hogar familiar, alertas y comportamiento financiero.</p>
      </div>

      {message && (
        <div className="rounded-md border bg-muted p-3 text-sm">{message}</div>
      )}

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="finance">Finanzas</TabsTrigger>
          <TabsTrigger value="family">Hogar</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="account">Cuenta</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Perfil personal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nombre completo</Label>
                  <Input value={profileForm.full_name} onChange={(event) => setProfileForm({ ...profileForm, full_name: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Telefono</Label>
                  <Input value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Idioma y region</Label>
                  <Select value={profileForm.locale} onValueChange={(value) => setProfileForm({ ...profileForm, locale: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es-AR">Espanol Argentina</SelectItem>
                      <SelectItem value="es-UY">Espanol Uruguay</SelectItem>
                      <SelectItem value="es-CL">Espanol Chile</SelectItem>
                      <SelectItem value="en-US">English US</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={email} disabled />
                </div>
              </div>
              <Button onClick={saveProfile} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar perfil
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finance">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Base financiera</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Moneda base</Label>
                    <Select value={settingsForm.default_currency_id} onValueChange={(value) => setSettingsForm({ ...settingsForm, default_currency_id: value })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar moneda" /></SelectTrigger>
                      <SelectContent>
                        {currencies?.map((currency) => (
                          <SelectItem key={currency.id} value={currency.id}>{currency.code} ({currency.symbol})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Saldo inicial</Label>
                    <Input type="number" step="0.01" value={settingsForm.initial_balance} onChange={(event) => setSettingsForm({ ...settingsForm, initial_balance: event.target.value })} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Meta mensual de ahorro</Label>
                    <Input type="number" step="0.01" value={settingsForm.monthly_savings_target} onChange={(event) => setSettingsForm({ ...settingsForm, monthly_savings_target: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Meta anual de ahorro</Label>
                    <Input type="number" step="0.01" value={settingsForm.annual_savings_target} onChange={(event) => setSettingsForm({ ...settingsForm, annual_savings_target: event.target.value })} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Captura y vistas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tipo por defecto</Label>
                    <Select value={settingsForm.default_transaction_type} onValueChange={(value) => setSettingsForm({ ...settingsForm, default_transaction_type: value as "expense" | "income" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Gasto</SelectItem>
                        <SelectItem value="income">Ingreso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Metodo de pago por defecto</Label>
                    <Select value={settingsForm.default_payment_method} onValueChange={(value) => setSettingsForm({ ...settingsForm, default_payment_method: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sin preferencia</SelectItem>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="debit">Debito</SelectItem>
                        <SelectItem value="credit">Credito</SelectItem>
                        <SelectItem value="transfer">Transferencia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Meses a proyectar</Label>
                    <Input type="number" min={1} max={24} value={settingsForm.dashboard_months_ahead} onChange={(event) => setSettingsForm({ ...settingsForm, dashboard_months_ahead: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Formato fecha</Label>
                    <Select value={settingsForm.date_format} onValueChange={(value) => setSettingsForm({ ...settingsForm, date_format: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dd/MM/yyyy">dd/MM/yyyy</SelectItem>
                        <SelectItem value="MM/dd/yyyy">MM/dd/yyyy</SelectItem>
                        <SelectItem value="yyyy-MM-dd">yyyy-MM-dd</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Formato numeros</Label>
                    <Select value={settingsForm.number_format} onValueChange={(value) => setSettingsForm({ ...settingsForm, number_format: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="es-AR">es-AR</SelectItem>
                        <SelectItem value="en-US">en-US</SelectItem>
                        <SelectItem value="es-CL">es-CL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-md border p-3">
                    <Switch checked={settingsForm.compact_mode} onCheckedChange={(checked) => setSettingsForm({ ...settingsForm, compact_mode: checked })} />
                    <span className="text-sm font-medium">Modo compacto</span>
                  </label>
                  <label className="flex items-center gap-3 rounded-md border p-3">
                    <Switch checked={settingsForm.show_archived} onCheckedChange={(checked) => setSettingsForm({ ...settingsForm, show_archived: checked })} />
                    <span className="text-sm font-medium">Mostrar archivados</span>
                  </label>
                </div>
                <Button onClick={saveSettings} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar finanzas
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="family">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader>
                <CardTitle>Hogar familiar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nombre del hogar</Label>
                    <Input value={familyForm.name} onChange={(event) => setFamilyForm({ ...familyForm, name: event.target.value })} placeholder="Familia, casa, departamento..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Moneda del hogar</Label>
                    <Select value={familyForm.default_currency_id} onValueChange={(value) => setFamilyForm({ ...familyForm, default_currency_id: value })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        {currencies?.map((currency) => (
                          <SelectItem key={currency.id} value={currency.id}>{currency.code} ({currency.symbol})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descripcion</Label>
                  <Textarea value={familyForm.description} onChange={(event) => setFamilyForm({ ...familyForm, description: event.target.value })} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Zona horaria</Label>
                    <Select value={familyForm.timezone} onValueChange={(value) => setFamilyForm({ ...familyForm, timezone: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/Argentina/Buenos_Aires">Buenos Aires</SelectItem>
                        <SelectItem value="America/Montevideo">Montevideo</SelectItem>
                        <SelectItem value="America/Santiago">Santiago</SelectItem>
                        <SelectItem value="America/New_York">New York</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Inicio del mes financiero</Label>
                    <Input type="number" min={1} max={28} value={familyForm.month_start_day} onChange={(event) => setFamilyForm({ ...familyForm, month_start_day: event.target.value })} />
                  </div>
                </div>
                <Button onClick={saveFamily} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {familyForm.id ? "Guardar hogar" : "Crear hogar"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Miembros</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {familyMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todavia no hay hogar creado.</p>
                ) : (
                  familyMembers.map((member) => (
                    <div key={member.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{member.user_id === userId ? "Vos" : member.user_id}</p>
                          <p className="text-xs text-muted-foreground">{member.family?.name}</p>
                        </div>
                        <Badge variant={member.role === "owner" ? "default" : "secondary"}>{member.role}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Alertas y automatizaciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Aviso previo de vencimiento de tarjeta</Label>
                  <Input type="number" min={0} max={31} value={settingsForm.notify_card_due_days} onChange={(event) => setSettingsForm({ ...settingsForm, notify_card_due_days: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Alerta de presupuesto usado %</Label>
                  <Input type="number" min={0} max={100} step="0.01" value={settingsForm.notify_budget_threshold} onChange={(event) => setSettingsForm({ ...settingsForm, notify_budget_threshold: event.target.value })} />
                </div>
              </div>
              <label className="flex items-center gap-3 rounded-md border p-3">
                <Switch checked={settingsForm.auto_create_card_transactions} onCheckedChange={(checked) => setSettingsForm({ ...settingsForm, auto_create_card_transactions: checked })} />
                <span className="text-sm font-medium">Crear transacciones automaticamente desde compras en cuotas</span>
              </label>
              <Button onClick={saveSettings} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar alertas
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <div className="grid gap-6 lg:grid-cols-2">
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
                  <p className="text-muted-foreground">ID usuario</p>
                  <p className="break-all font-mono text-xs">{userId || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Perfil</p>
                  <p className="font-medium">{profile ? "Configurado" : "Pendiente"}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Estado de datos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Supabase Auth</span>
                  <Badge variant="secondary">Activo</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Preferencias</span>
                  <Badge variant={settings ? "secondary" : "outline"}>{settings ? "Guardadas" : "Sin guardar"}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Hogar familiar</span>
                  <Badge variant={activeMembership ? "secondary" : "outline"}>{activeMembership ? "Activo" : "Pendiente"}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
