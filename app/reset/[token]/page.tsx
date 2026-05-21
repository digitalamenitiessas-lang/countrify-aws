import { ResetPasswordForm } from '@/components/reset-password-form'

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <div className="min-h-screen bg-background pt-16 flex items-center justify-center px-6 py-16">
      <div className="glass-card rounded-2xl p-8 w-full max-w-md">
        <h1 className="font-serif text-3xl font-bold text-foreground mb-2">Nueva contraseña</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Elegí una contraseña nueva para tu cuenta de Countrify.
        </p>
        <ResetPasswordForm token={token} />
      </div>
    </div>
  )
}
