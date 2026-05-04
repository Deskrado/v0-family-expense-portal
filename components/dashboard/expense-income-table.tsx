'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/currency'
import { Currency, GroupSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ExpenseIncomeTableProps {
  expenseGroups: GroupSummary[]
  incomeGroups: GroupSummary[]
  currency: Currency | null
  type: 'expense' | 'income'
}

export function ExpenseIncomeTable({ 
  expenseGroups, 
  incomeGroups, 
  currency, 
  type 
}: ExpenseIncomeTableProps) {
  const groups = type === 'expense' ? expenseGroups : incomeGroups
  const title = type === 'expense' ? 'Gastos' : 'Ganancias'
  const titleColor = type === 'expense' ? 'text-destructive' : 'text-success'

  const totals = groups.reduce(
    (acc, group) => ({
      budgeted: acc.budgeted + group.budgeted,
      actual: acc.actual + group.actual,
      difference: acc.difference + group.difference,
    }),
    { budgeted: 0, actual: 0, difference: 0 }
  )

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className={cn("text-lg", titleColor)}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium text-muted-foreground"></th>
                <th className="text-right py-2 font-medium text-muted-foreground">Previsto</th>
                <th className="text-right py-2 font-medium text-muted-foreground">Real</th>
                <th className="text-right py-2 font-medium text-muted-foreground">Difer.</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-muted/50">
                <td className="py-2 font-medium text-muted-foreground">Totales</td>
                <td className="text-right py-2 font-medium">{formatCurrency(totals.budgeted, currency)}</td>
                <td className="text-right py-2 font-medium">{formatCurrency(totals.actual, currency)}</td>
                <td className={cn(
                  "text-right py-2 font-medium",
                  type === 'expense' 
                    ? totals.difference <= 0 ? "text-success" : "text-destructive"
                    : totals.difference >= 0 ? "text-success" : "text-destructive"
                )}>
                  {formatCurrency(totals.difference, currency)}
                </td>
              </tr>
              {groups.map((group, idx) => (
                <tr key={idx} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 font-medium" style={{ borderLeftColor: group.group?.color, borderLeftWidth: 3 }}>
                    {group.group?.name || 'Sin grupo'}
                  </td>
                  <td className="text-right py-2 text-muted-foreground">
                    {formatCurrency(group.budgeted, currency)}
                  </td>
                  <td className="text-right py-2">
                    {formatCurrency(group.actual, currency)}
                  </td>
                  <td className={cn(
                    "text-right py-2",
                    type === 'expense' 
                      ? group.difference <= 0 ? "text-success" : "text-destructive"
                      : group.difference >= 0 ? "text-success" : "text-destructive"
                  )}>
                    {formatCurrency(group.difference, currency)}
                  </td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    No hay datos para mostrar
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
