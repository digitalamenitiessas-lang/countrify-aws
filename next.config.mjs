/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone' se saco al desplegar.
  //
  // Era para la imagen de Docker. El VPS resulto tener 1 nucleo y ya correr 12
  // servicios con un patron propio (apps Next como servicio de systemd detras
  // del Caddy nativo), asi que Countrify se despliega igual que las demas y
  // arranca con `next start`.
  //
  // Con standalone activo, `next start` imprime en cada arranque
  // «"next start" does not work with "output: standalone"». Empiricamente
  // funciona —rutas, chunks y assets sirven bien— pero dejar un aviso que dice
  // que algo no funciona, cuando funciona, hace perder tiempo al que opere esto
  // dentro de seis meses. Si algun dia se vuelve a Docker, se repone.
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
