import { Suspense } from "react"
import { ProjectionDashboard } from "@/components/projections/projection-dashboard"

export default function ProyeccionPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Cargando proyección…</div>}>
      <ProjectionDashboard />
    </Suspense>
  )
}
