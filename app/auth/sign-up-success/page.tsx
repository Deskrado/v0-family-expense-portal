import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-center">Revisa tu email</CardTitle>
            <CardDescription className="text-center">
              Te enviamos un enlace de confirmación a tu correo electrónico.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Haz click en el enlace del email para activar tu cuenta y comenzar a usar Control de Gastos.
            </p>
            <Button asChild variant="outline">
              <Link href="/auth/login">Volver al inicio</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
