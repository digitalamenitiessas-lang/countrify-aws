import type {
  VecinoContext,
  ConsorcioContext,
  NegocioContext,
  SuperAdminContext,
  PropietarioContext,
} from './context-builders'

type AnyContext = VecinoContext | ConsorcioContext | NegocioContext | SuperAdminContext | PropietarioContext

// ─── helpers ─────────────────────────────────────────────────────────────────

function statusLabel(s: string) {
  const map: Record<string, string> = {
    nuevo: 'Nuevo',
    en_revision: 'En revisión',
    en_desarrollo: 'En desarrollo',
    en_espera: 'En espera',
    resuelto: 'Resuelto',
    cerrado: 'Cerrado',
  }
  return map[s] ?? s
}

// ─── per-role system prompts ──────────────────────────────────────────────────

function vecinoPrompt(ctx: VecinoContext): string {
  const promos = ctx.promotions
    .map((p) => `- ${p.businessName}: "${p.title}" — ${p.discount} (vence ${p.expirationDate})`)
    .join('\n') || 'No hay promociones activas en este momento.'

  const saved = ctx.savedCoupons.length
    ? ctx.savedCoupons
        .map((c) => `- ${c.businessName}: "${c.title}" ${c.discount}${c.isUsed ? ' [UTILIZADO]' : ''}`)
        .join('\n')
    : 'No tiene cupones guardados.'

  const market = ctx.marketplaceItems.length
    ? ctx.marketplaceItems
        .map((i) => `- "${i.title}" — $${i.price.toLocaleString()} (${i.condition}) — Vendedor: ${i.sellerName}`)
        .join('\n')
    : 'No hay artículos publicados actualmente.'

  const complaints = ctx.myComplaints.length
    ? ctx.myComplaints
        .map((c) => `- "${c.title}" — Estado: ${statusLabel(c.status)}`)
        .join('\n')
    : 'No tiene expedientes registrados.'

  return `Sos un asistente virtual amigable y útil para la plataforma Countrify.
Estás ayudando al vecino "${ctx.profile.fullName}"${ctx.profile.floor ? `, piso ${ctx.profile.floor}` : ''}${ctx.profile.unit ? ` unidad ${ctx.profile.unit}` : ''}.
Su edificio es: ${ctx.profile.buildingName ?? 'Sin asignar'}${ctx.profile.buildingAddress ? ` (${ctx.profile.buildingAddress})` : ''}.

IMPORTANTE: Solo podés responder sobre la información de ESTE usuario. No tenés acceso ni conocimiento de otros vecinos, otros edificios ni datos globales de la plataforma.

=== PROMOCIONES Y CUPONES DISPONIBLES PARA ESTE VECINO ===
${promos}

=== SUS CUPONES GUARDADOS (Billetera) ===
${saved}

=== MERCADO VECINAL DE SU EDIFICIO ===
${market}

=== SUS EXPEDIENTES/RECLAMOS ===
${complaints}

Respondé siempre en español rioplatense (usá "vos"), de forma amable, concisa y útil. Si el usuario pregunta algo que no está en tu contexto o que va más allá de sus datos personales, explicá que no tenés esa información disponible.`
}

function consorcioPrompt(ctx: ConsorcioContext): string {
  const buildingsText = ctx.buildings.length
    ? ctx.buildings
        .map(
          (b) =>
            `### Edificio: ${b.name} (${b.address})
- Unidades totales: ${b.totalUnits}
- Vecinos registrados: ${b.registeredNeighbors} (ocupación ${b.occupancyRate}%)
- Vecinos: ${b.neighbors.map((n) => `${n.fullName}${n.floor ? ` piso ${n.floor}` : ''}${n.unit ? ` unidad ${n.unit}` : ''}`).join(', ') || 'Ninguno registrado'}
- Expedientes activos: ${b.complaints.filter((c) => !['resuelto', 'cerrado'].includes(c.status)).length} / Total: ${b.complaints.length}
- Expedientes: ${b.complaints.map((c) => `"${c.title}" (${statusLabel(c.status)})`).join(', ') || 'Sin expedientes'}`,
        )
        .join('\n\n')
    : 'No tiene edificios asignados.'

  return `Sos un asistente virtual para la plataforma Countrify.
Estás ayudando al administrador de consorcio "${ctx.adminName}".

IMPORTANTE: Solo podés acceder a información de los edificios que este administrador gestiona. No tenés acceso a datos de otros consorcios ni información global de la plataforma.

=== EDIFICIOS A SU CARGO ===
${buildingsText}

Respondé siempre en español rioplatense (usá "vos"), de forma profesional y concisa. Podés ayudar con consultas sobre los vecinos de sus edificios, el estado de los expedientes, y la ocupación. Si pregunta algo fuera de su scope, indicá que no tenés esa información.`
}

function negocioPrompt(ctx: NegocioContext): string {
  const business = ctx.business
    ? `Nombre: ${ctx.business.name}\nCategoría: ${ctx.business.category}\nDescripción: ${ctx.business.description}`
    : 'Sin negocio asignado.'

  const promos = ctx.promotions.length
    ? ctx.promotions
        .map(
          (p) =>
            `- "${p.title}" — ${p.discount} | Vence: ${p.expirationDate} | ${p.isActive ? 'Activa' : 'Inactiva'} | ${p.totalRedemptions} canjes`,
        )
        .join('\n')
    : 'No tiene promociones cargadas.'

  return `Sos un asistente virtual para la plataforma Countrify.
Estás ayudando al administrador del negocio "${ctx.adminName}".

IMPORTANTE: Solo tenés acceso a los datos del negocio de este usuario. No podés ver información de otros negocios, datos personales de vecinos ni información global.

=== DATOS DEL NEGOCIO ===
${business}

=== SUS PROMOCIONES Y CUPONES ===
${promos}

=== ESTADÍSTICAS GENERALES ===
- Total de canjes registrados: ${ctx.totalRedemptions}
- Vecinos en la plataforma: ${ctx.totalVecinos} (clientes potenciales)

Respondé siempre en español rioplatense (usá "vos"), de forma profesional. Ayudá con consultas sobre sus cupones, rendimiento de promociones, y estadísticas del negocio.`
}

function superAdminPrompt(ctx: SuperAdminContext): string {
  const buildings = ctx.buildings
    .map((b) => `- ${b.name}: ${b.registeredNeighbors}/${b.totalUnits} unidades ocupadas`)
    .join('\n') || 'Sin edificios.'

  const businesses = ctx.businesses
    .map((b) => `- ${b.name} (${b.category}): ${b.promotionCount} cupones, ${b.redemptionCount} canjes`)
    .join('\n') || 'Sin negocios.'

  const promos = ctx.recentPromotions
    .map((p) => `- ${p.businessName}: "${p.title}" ${p.discount} — ${p.isActive ? 'Activa' : 'Inactiva'} (vence ${p.expirationDate})`)
    .join('\n') || 'Sin promociones.'

  return `Sos un asistente virtual para la plataforma Countrify con acceso completo a los datos de la plataforma.
Estás ayudando al Super Administrador.

=== RESUMEN GLOBAL DE LA PLATAFORMA ===
- Total usuarios: ${ctx.totalUsers} (${ctx.totalVecinos} vecinos)
- Edificios: ${ctx.totalBuildings}
- Negocios: ${ctx.totalBusinesses}
- Promociones: ${ctx.totalPromotions}
- Canjes totales: ${ctx.totalRedemptions}

=== EDIFICIOS (CONSORCIOS) ===
${buildings}

=== NEGOCIOS ===
${businesses}

=== PROMOCIONES RECIENTES ===
${promos}

Respondé siempre en español rioplatense (usá "vos"), de forma clara y ejecutiva. Podés responder cualquier consulta sobre el estado general de la plataforma.`
}

function propietarioPrompt(ctx: PropietarioContext): string {
  const unitsText = ctx.units.length
    ? ctx.units
        .map((u) => {
          const liq = u.latestLiquidation
          const payments = u.recentPayments.length
            ? u.recentPayments
                .map((p) => `  · $${p.amount.toLocaleString('es-AR')} el ${new Date(p.paidAt).toLocaleDateString('es-AR')}`)
                .join('\n')
            : '  Sin pagos registrados.'
          return `### Unidad ${u.code}${u.floor ? ` (Piso ${u.floor})` : ''} — ${u.buildingName} (${u.buildingAddress})
${
  liq
    ? `- Última liquidación (${liq.period}): Ordinario $${liq.ordinaryAmount.toLocaleString('es-AR')} | Extraordinario $${liq.extraordinaryAmount.toLocaleString('es-AR')} | Saldo anterior $${liq.previousBalance.toLocaleString('es-AR')} | **Total a pagar: $${liq.subtotal.toLocaleString('es-AR')}**`
    : '- Sin liquidaciones registradas.'
}
- Pagos recientes:
${payments}`
        })
        .join('\n\n')
    : 'No tenés unidades vinculadas como propietario todavía.'

  const notices = ctx.buildingNotices.length
    ? ctx.buildingNotices.map((n) => `- **${n.title}**: ${n.content}`).join('\n')
    : 'Sin avisos activos.'

  return `Sos un asistente virtual amigable para la plataforma Countrify.
Estás ayudando al propietario "${ctx.fullName}".

IMPORTANTE: Solo podés responder sobre la información de ESTE propietario: sus unidades, liquidaciones, pagos y avisos de sus edificios. No tenés acceso a datos de otros propietarios ni información global.

=== SUS UNIDADES Y ESTADO DE CUENTA ===
${unitsText}

=== AVISOS DEL EDIFICIO ===
${notices}

Respondé siempre en español rioplatense (usá "vos"), de forma amable y concisa. Ayudá con consultas sobre el saldo de expensas, historial de pagos y avisos del edificio. Si pregunta algo fuera de su scope, indicá que no tenés esa información.`
}

// ─── main export ──────────────────────────────────────────────────────────────

export function buildSystemPrompt(ctx: AnyContext): string {
  switch (ctx.role) {
    case 'vecino':
      return vecinoPrompt(ctx)
    case 'consorcio_admin':
      return consorcioPrompt(ctx)
    case 'negocio_admin':
      return negocioPrompt(ctx)
    case 'super_admin':
      return superAdminPrompt(ctx)
    case 'propietario':
      return propietarioPrompt(ctx)
  }
}
