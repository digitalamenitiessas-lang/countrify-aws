/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // typescript.ignoreBuildErrors estaba en true y se saco a proposito.
  //
  // Este proyecto no tiene un solo test. Con el chequeo de tipos ademas
  // apagado, un import roto o una firma cambiada a medias pasaban el build en
  // verde y explotaban recien cuando un usuario hacia click en produccion.
  // Eran las dos unicas redes, las dos caidas al mismo tiempo.
  //
  // El arbol typechequea limpio (0 errores). Si un cambio futuro rompe el
  // build, ese es el mecanismo funcionando: arreglar el tipo, no volver a
  // poner esta bandera.
  images: {
    unoptimized: true,
  },
  experimental: {
    // El alta de gasto manda el comprobante en base64 por server action
    // (app/iadmin/gastos/actions.ts) y el form acepta hasta 10MB, pero el
    // default de Next es 1MB: sin esto, cualquier comprobante de mas de ~750KB
    // falla con un error que no dice nada util. 12mb deja margen para el
    // overhead de base64 (~33%) sobre los 10MB del form.
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
}

export default nextConfig
