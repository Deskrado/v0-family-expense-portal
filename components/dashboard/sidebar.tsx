'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { 
  LayoutDashboard, 
  ArrowUpDown, 
  CreditCard, 
  FolderOpen, 
  PiggyBank, 
  TrendingUp, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Wallet
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useFamilyVisibility } from '@/components/dashboard/use-dashboard-data'
import { canSeeModule } from '@/lib/family-visibility'

const navigation = [
  { module: 'dashboard', name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { module: 'transactions', name: 'Transacciones', href: '/dashboard/transacciones', icon: ArrowUpDown },
  { module: 'credit_cards', name: 'Tarjetas', href: '/dashboard/tarjetas', icon: CreditCard },
  { module: 'categories', name: 'Categorías', href: '/dashboard/categorias', icon: FolderOpen },
  { module: 'investments', name: 'Inversiones', href: '/dashboard/inversiones', icon: TrendingUp },
  { module: 'savings', name: 'Ahorros', href: '/dashboard/ahorros', icon: PiggyBank },
  { module: 'projections', name: 'Proyección', href: '/dashboard/proyeccion', icon: Wallet },
  { module: 'settings', name: 'Configuración', href: '/dashboard/configuracion', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { data: visibility } = useFamilyVisibility()
  const visibleNavigation = navigation.filter((item) =>
    canSeeModule(item.module, visibility?.membership, visibility?.permissions),
  )

  return (
    <aside
      className={cn(
        'flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!collapsed && (
          <h1 className="text-lg font-semibold truncate">Control de Gastos</h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground shrink-0"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      
      <nav className="flex-1 p-2 space-y-1">
        {visibleNavigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
