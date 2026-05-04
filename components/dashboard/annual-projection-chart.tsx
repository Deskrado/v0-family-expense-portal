'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, getMonthName } from '@/lib/currency'
import { Currency } from '@/lib/types'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
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
}

export function AnnualProjectionChart({ 
  data, 
  currentMonth, 
  currentYear, 
  currency 
}: AnnualProjectionChartProps) {
  const chartData = data.map(item => ({
    name: getMonthName(item.month, true),
    month: item.month,
    year: item.year,
    Ingresos: item.income,
    Gastos: item.expenses,
    Ahorro: item.savings,
    isProjected: item.year > currentYear || (item.year === currentYear && item.month > currentMonth),
  }))

  const currentIndex = chartData.findIndex(
    d => d.month === currentMonth && d.year === currentYear
  )

  const formatValue = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
    return value.toString()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Proyeccion Anual</CardTitle>
        <p className="text-sm text-muted-foreground">
          Ingresos, gastos y ahorro de los ultimos 12 meses
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
              />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value, currency)}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend />
              {currentIndex >= 0 && (
                <ReferenceLine 
                  x={chartData[currentIndex]?.name} 
                  stroke="hsl(var(--primary))" 
                  strokeDasharray="3 3"
                  label={{ value: 'Hoy', position: 'top', fill: 'hsl(var(--primary))' }}
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
      </CardContent>
    </Card>
  )
}
