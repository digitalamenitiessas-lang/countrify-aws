import { redirect } from 'next/navigation'

// El hub de configuración fue reemplazado por tabs reales en el sub-nav del consorcio.
// Mantenemos la URL viva por compatibilidad con bookmarks y la redirigimos a "Datos y unidades".
export default async function ConfiguracionRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/iadmin/consorcios/${id}/gestion`)
}
