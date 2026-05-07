"use client"

import { SettingsManagement } from "@/components/settings/settings-management"
import { useFamilyVisibility } from "@/components/dashboard/use-dashboard-data"
import { canSeeModule } from "@/lib/family-visibility"

export default function ConfiguracionPage() {
  const { data: visibility, isLoading } = useFamilyVisibility()
  const canViewSettings = canSeeModule("settings", visibility?.membership, visibility?.permissions)

  if (!isLoading && !canViewSettings) {
    return (
      <div className="rounded-md border bg-muted p-4 text-sm text-muted-foreground">
        No tenés permisos para ver la configuración del hogar.
      </div>
    )
  }

  return <SettingsManagement />
}
