'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, getMonthName } from '@/lib/currency'
import { Currency } from '@/lib/types'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts'

interface MonthlyData {
  month: number
  year: number
  income: number
  expenses: number
  savings: number
}

interface AnnualProjectionChartProps {
  data: MonthlyData[]
  currentMonth: number
  currentYear: number
  currency: Currency | null
  title?: string
  description?: string
}

type ChartPoint = {
  name: string
  month: number
  year: number
  Ingresos: number
  Gastos: number
  Ahorro: number
  isProjected: boolean
}

export function AnnualProjectionChart({ 
  data, 
  currentMonth, 
  currentYear, 
  currency,
  title = 'Proyección anual',
  description = 'Ingresos, gastos y ahorro del período seleccionado',
}: AnnualProjectionChartProps) {
  const chartData = useMemo<ChartPoint[]>(() => data.map(item => ({
    name: getMonthName(item.month, true),
    month: item.month,
    year: item.year,
    Ingresos: item.income,
    Gastos: item.expenses,
    Ahorro: item.savings,
    isProjected: item.year > currentYear || (item.year === currentYear && item.month > currentMonth),
  })), [currentMonth, currentYear, data])

  const currentIndex = chartData.findIndex(
    d => d.month === currentMonth && d.year === currentYear
  )
  const [activePoint, setActivePoint] = useState<ChartPoint | null>(null)
  const detailPoint = activePoint || chartData[currentIndex] || chartData[0] || null

  const formatValue = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
    return value.toString()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
          <div className="h-[320px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 12, right: 18, left: 12, bottom: 6 }}
                onMouseMove={(state) => {
                  const nextPoint = state?.activePayload?.[0]?.payload as ChartPoint | undefined
                  if (nextPoint) setActivePoint(nextPoint)
                }}
                onMouseLeave={() => setActivePoint(null)}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tickFormatter={formatValue}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                  width={48}
                />
                <Legend wrapperStyle={{ paddingTop: 8 }} />
                {currentIndex >= 0 && (
                  <ReferenceLine
                    x={chartData[currentIndex]?.name}
                    stroke="hsl(var(--primary))"
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                  />
                )}
                <Bar
                  dataKey="Ingresos"
                  fill="hsl(145, 60%, 45%)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="Gastos"
                  fill="hsl(0, 70%, 55%)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="Ahorro"
                  fill="hsl(250, 60%, 55%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-md border bg-muted/30 p-4">
            {detailPoint ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">{detailPoint.year}</p>
                  <h3 className="text-lg font-semibold">{getMonthName(detailPoint.month)}</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-success">Ingresos</span>
                    <span className="font-mono">{formatCurrency(detailPoint.Ingresos, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-destructive">Gastos</span>
                    <span className="font-mono">{formatCurrency(detailPoint.Gastos, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-primary">Ahorro</span>
                    <span className="font-mono">{formatCurrency(detailPoint.Ahorro, currency)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">Sin datos para mostrar</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
