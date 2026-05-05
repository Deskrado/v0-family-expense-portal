"use client"

import { useMemo, useState } from "react"
import {
  useBrokerConnections,
  useBrokerPositions,
  useFxQuotes,
  usePortfolioSnapshots,
} from "@/components/dashboard/use-dashboard-data"
import { formatCurrency } from "@/lib/currency"
import type { BrokerConnection } from "@/lib/types"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Activity, Link2, Loader2, RefreshCw, ShieldCheck, Unlink } from "lucide-react"
import { mutate } from "swr"

type Message = { type: "success" | "error"; text: string } | null

const brokerKeys = ["broker-connections", "broker-positions", "portfolio-snapshots"] as const

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  return new Date(value).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

function statusVariant(status: BrokerConnection["status"]) {
  if (status === "active") return "secondary"
  if (status === "disabled") return "outline"
  return "destructive"
}

function statusLabel(status: BrokerConnection["status"]) {
  if (status === "active") return "Activa"
  if (status === "reauth_required") return "Requiere reconexión"
  if (status === "disabled") return "Deshabilitada"
  return "Error"
}

async function postJson(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || "No se pudo completar la solicitud")
  }
  return payload
}

export function PortfolioIntegrations({ variant = "portfolio" }: { variant?: "portfolio" | "settings" }) {
  const { data: connections, isLoading: isLoadingConnections } = useBrokerConnections()
  const { data: positions, isLoading: isLoadingPositions } = useBrokerPositions()
  const { data: snapshots } = usePortfolioSnapshots()
  const { data: fxQuotes, isLoading: isLoadingFx } = useFxQuotes()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("IOL")
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox")
  const [action, setAction] = useState<string | null>(null)
  const [message, setMessage] = useState<Message>(null)

  const latestSnapshot = snapshots?.[0] || null
  const latestFxQuotes = useMemo(() => {
    const seen = new Set<string>()
    return (fxQuotes || []).filter((quote) => {
      const key = `${quote.source}-${quote.rate_type}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [fxQuotes])

  const blueQuote = latestFxQuotes.find((quote) => quote.rate_type.toLowerCase().includes("blue"))
  const isSettings = variant === "settings"

  const refreshBrokerData = () => {
    brokerKeys.forEach((key) => mutate(key))
  }

  const connectIol = async (connection?: BrokerConnection) => {
    if (!username.trim() || !password.trim()) {
      setMessage({ type: "error", text: "Completa usuario y password de IOL" })
      return
    }

    setAction(connection ? `reconnect-${connection.id}` : "connect")
    setMessage(null)
    try {
      await postJson("/api/integrations/iol/connect", {
        username: username.trim(),
        password,
        displayName: connection?.display_name || displayName.trim() || "IOL",
        environment: connection?.environment || environment,
        ...(connection ? { connectionId: connection.id } : {}),
      })
      setPassword("")
      setMessage({ type: "success", text: connection ? "Conexion IOL reconectada" : "Conexion IOL creada" })
      refreshBrokerData()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Error al conectar IOL" })
    } finally {
      setAction(null)
    }
  }

  const syncIol = async (connectionId: string) => {
    setAction(`sync-${connectionId}`)
    setMessage(null)
    try {
      const result = await postJson("/api/integrations/iol/sync", { connectionId })
      setMessage({ type: "success", text: `Sincronizacion lista: ${result.positions || 0} posiciones` })
      refreshBrokerData()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Error al sincronizar IOL" })
    } finally {
      setAction(null)
    }
  }

  const disconnectIol = async (connectionId: string) => {
    if (!window.confirm("Desconectar esta integracion IOL?")) return
    setAction(`disconnect-${connectionId}`)
    setMessage(null)
    try {
      await postJson("/api/integrations/iol/disconnect", { connectionId })
      setMessage({ type: "success", text: "Integracion desconectada" })
      refreshBrokerData()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Error al desconectar IOL" })
    } finally {
      setAction(null)
    }
  }

  const syncFx = async () => {
    setAction("fx")
    setMessage(null)
    try {
      const result = await postJson("/api/market/fx/sync")
      setMessage({ type: "success", text: `Cotizaciones actualizadas: ${result.quotes || 0}` })
      mutate("fx-quotes")
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Error al actualizar cotizaciones" })
    } finally {
      setAction(null)
    }
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className={`rounded-md p-3 text-sm ${message.type === "error" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
          {message.text}
        </div>
      )}

      {!isSettings && <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Portfolio conectado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold font-mono">
            {latestSnapshot ? formatCurrency(Number(latestSnapshot.total_value), latestSnapshot.currency) : "-"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Posiciones leidas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold font-mono">{positions?.length || 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Dolar blue venta</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold font-mono">
            {blueQuote?.ask ? formatCurrency(Number(blueQuote.ask), blueQuote.quote_currency) : "-"}
          </CardContent>
        </Card>
      </div>}

      <Tabs defaultValue={isSettings ? "connection" : "portfolio"} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          {!isSettings && <TabsTrigger value="portfolio"><Activity className="h-4 w-4" /> Portfolio</TabsTrigger>}
          {!isSettings && <TabsTrigger value="positions">Posiciones</TabsTrigger>}
          <TabsTrigger value="fx">Divisas</TabsTrigger>
          {isSettings && <TabsTrigger value="connection"><Link2 className="h-4 w-4" /> IOL</TabsTrigger>}
        </TabsList>

        {!isSettings && <TabsContent value="portfolio">
          <Card>
            <CardHeader>
              <CardTitle>Snapshots</CardTitle>
            </CardHeader>
            <CardContent>
              {!snapshots?.length ? (
                <div className="py-8 text-center text-muted-foreground">No hay snapshots sincronizados</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Cuenta</TableHead>
                        <TableHead>Origen</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshots.map((snapshot) => (
                        <TableRow key={snapshot.id}>
                          <TableCell>{formatDateTime(snapshot.snapshot_at)}</TableCell>
                          <TableCell>{snapshot.account?.name || "-"}</TableCell>
                          <TableCell>{snapshot.source.toUpperCase()}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(Number(snapshot.total_value), snapshot.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>}

        {!isSettings && <TabsContent value="positions">
          <Card>
            <CardHeader>
              <CardTitle>Posiciones</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingPositions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !positions?.length ? (
                <div className="py-8 text-center text-muted-foreground">No hay posiciones disponibles</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Instrumento</TableHead>
                        <TableHead>Mercado</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Actualizado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {positions.map((position) => (
                        <TableRow key={position.id}>
                          <TableCell className="font-medium">{position.instrument?.symbol || "SIN-TICKER"}</TableCell>
                          <TableCell>{position.instrument?.market || position.source.toUpperCase()}</TableCell>
                          <TableCell className="text-right font-mono">{Number(position.quantity).toLocaleString("es-AR")}</TableCell>
                          <TableCell className="text-right font-mono">{position.price ? formatCurrency(Number(position.price), position.currency) : "-"}</TableCell>
                          <TableCell className="text-right font-mono">{position.market_value ? formatCurrency(Number(position.market_value), position.currency) : "-"}</TableCell>
                          <TableCell>{formatDateTime(position.observed_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>}

        <TabsContent value="fx">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Cotizaciones</CardTitle>
                <Button onClick={syncFx} disabled={action === "fx"}>
                  {action === "fx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Actualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingFx ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !latestFxQuotes.length ? (
                <div className="py-8 text-center text-muted-foreground">No hay cotizaciones cargadas</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Par</TableHead>
                        <TableHead className="text-right">Compra</TableHead>
                        <TableHead className="text-right">Venta</TableHead>
                        <TableHead>Fuente</TableHead>
                        <TableHead>Fecha</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {latestFxQuotes.map((quote) => (
                        <TableRow key={quote.id}>
                          <TableCell className="capitalize">{quote.rate_type}</TableCell>
                          <TableCell>{quote.base_currency?.code || "USD"}/{quote.quote_currency?.code || "ARS"}</TableCell>
                          <TableCell className="text-right font-mono">{quote.bid ? formatCurrency(Number(quote.bid), quote.quote_currency) : "-"}</TableCell>
                          <TableCell className="text-right font-mono">{quote.ask ? formatCurrency(Number(quote.ask), quote.quote_currency) : "-"}</TableCell>
                          <TableCell>{quote.source}</TableCell>
                          <TableCell>{formatDateTime(quote.observed_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isSettings && <TabsContent value="connection">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <Card>
              <CardHeader>
                <CardTitle>Conectar IOL</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>Modo solo lectura para portfolio, cuenta y cotizaciones.</span>
                </div>
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Ambiente</Label>
                  <Select value={environment} onValueChange={(value) => setEnvironment(value as "sandbox" | "production")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox</SelectItem>
                      <SelectItem value="production">Producción</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Usuario IOL</Label>
                  <Input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Password IOL</Label>
                  <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                </div>
                <Button className="w-full" onClick={() => connectIol()} disabled={action === "connect"}>
                  {action === "connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                  Conectar
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conexiones</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingConnections ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : !connections?.length ? (
                  <div className="py-8 text-center text-muted-foreground">No hay conexiones configuradas</div>
                ) : (
                  <div className="space-y-3">
                    {connections.map((connection) => (
                      <div key={connection.id} className="rounded-md border p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{connection.display_name}</span>
                              <Badge variant={statusVariant(connection.status)}>{statusLabel(connection.status)}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {connection.provider?.name || "IOL"} - {connection.environment} - sync {formatDateTime(connection.last_sync_at)}
                            </div>
                            {connection.status === "reauth_required" && (
                              <div className="text-sm text-muted-foreground">
                                Ingresa usuario y password arriba y usa Reconectar para renovar el acceso read-only.
                              </div>
                            )}
                            {connection.last_error && <div className="text-sm text-destructive">{connection.last_error}</div>}
                          </div>
                          <div className="flex gap-2">
                            {connection.status === "reauth_required" && (
                              <Button
                                onClick={() => connectIol(connection)}
                                disabled={action === `reconnect-${connection.id}`}
                              >
                                {action === `reconnect-${connection.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                                Reconectar
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              onClick={() => syncIol(connection.id)}
                              disabled={connection.status !== "active" || action === `sync-${connection.id}`}
                            >
                              {action === `sync-${connection.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                              Sync
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => disconnectIol(connection.id)}
                              disabled={connection.status === "disabled" || action === `disconnect-${connection.id}`}
                            >
                              {action === `disconnect-${connection.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlink className="mr-2 h-4 w-4" />}
                              Desconectar
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>}
      </Tabs>
    </div>
  )
}
