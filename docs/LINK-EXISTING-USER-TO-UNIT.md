# Vincular vecino existente a unidad — spec compartida Countrify / Citify

Documento de implementación para cerrar el hueco entre **superadmin crea usuario** e **iadmin lo asigna a una unidad**. Pensado para que pueda implementarse en paralelo en Countrify y Citify (mismo modelo de datos, mismos nombres de tabla en ambos lados).

> **Estado al 2026-05-26:**
> - ✅ **Countrify**: implementado en commit `ed07941`. Las 4 piezas (query
>   `listLinkableProfilesByBuildingFromPostgres`, helper
>   `getIAdminLinkableProfiles`, action `linkExistingProfileToUnit`, UI en
>   `units-manager.tsx`) están en producción.
> - ⏳ **Citify**: pendiente de implementar. Esta spec sigue siendo el
>   contrato para el port — solo cambiar `countrify.*` por el schema
>   de Citify.

## Contexto

Flujo objetivo:

```
SUPERADMIN              IADMIN (admin del consorcio)         VECINO
──────────              ─────────────────────────────         ──────
crea profile      →     ve lista de vecinos del         →    ve "Mi unidad"
+ buildingId            building sin unidad asignada         + grupo familiar
                        + los vincula a unidades
                        + ve unidades a cargo
```

## Estado actual

| Pieza | Countrify | Citify | Referencia |
|---|---|---|---|
| Superadmin crea usuario con `buildingId` | ✅ | ✅ | `app/superadmin/actions.ts` → `createPlatformUser` |
| Iadmin ve unidades del consorcio | ✅ | ✅ | `app/iadmin/consorcios/[id]/gestion/page.tsx` → `getIAdminUnitsWithHolders` |
| Iadmin **ve vecinos del building disponibles para vincular** | ✅ (commit `ed07941`) | ⏳ pendiente | `lib/db/iadmin-reads.ts` → `listLinkableProfilesByBuildingFromPostgres` |
| Iadmin vincula vecino existente | ✅ (commit `ed07941`) | parcial — solo si tipea el email exacto en el form de creación | `app/iadmin/consorcios/[id]/actions.ts` → `linkExistingProfileToUnit` (Countrify) / `createUnitUser` (Citify) |
| Vecino ve su unidad | ✅ | ✅ | `components/dashboards/consumer-dashboard.tsx` |

En Countrify cerrado. En Citify sigue faltando el selector de "profiles existentes del building todavía sin membership".

## Modelo de datos relevante

Dos tablas paralelas por unidad:

- `iadmin_unit_holders` — titulares contables/legales (propietario / inquilino / apoderado). **No requieren cuenta**, son solo registro.
- `unit_profile_memberships` — vínculo a `profiles` con login Cognito. `relationship_type ∈ { 'propietario', 'vecino_principal', 'vecino_adicional' }`.

Un `profile` con `building_id = X` y rol `vecino` / `propietario` que no tiene fila activa en `unit_profile_memberships` es un **vecino huérfano** — lo que hoy queda invisible para el iadmin.

## Cambios a implementar

### 1. Query nueva

Archivo: `lib/db/iadmin-reads.ts`

```ts
export async function listLinkableProfilesByBuildingFromPostgres(
  buildingId: string,
): Promise<Array<{
  id: string
  email: string
  full_name: string
  role: 'vecino' | 'propietario'
  phone: string | null
  active_memberships_count: number
}>> {
  const result = await pgQuery(
    `
      select
        p.id,
        p.email,
        p.full_name,
        p.role,
        p.phone,
        coalesce(m.active_count, 0)::int as active_memberships_count
      from countrify.profiles p
      left join (
        select profile_id, count(*) as active_count
        from countrify.unit_profile_memberships
        where building_id = $1 and active = true
        group by profile_id
      ) m on m.profile_id = p.id
      where p.building_id = $1
        and p.role in ('vecino', 'propietario')
      order by coalesce(m.active_count, 0) asc, p.full_name asc
    `,
    [buildingId],
  )
  return result.rows
}
```

Notas:
- No filtramos `active_count = 0` en SQL porque queremos también mostrar vecinos que ya tienen una membership y podrían sumar otra (ej: propietario que además es vecino_principal en otra unidad, o conviviente adicional). En la UI sí ordenamos los "sin unidad" primero.
- En Citify reemplazar el schema `countrify.` por el que corresponda (`citify.` / `public.`).

Wrapper en `lib/data.ts`:

```ts
export async function getIAdminLinkableProfiles(buildingId: string): Promise<IAdminLinkableProfile[]> {
  const rows = await listLinkableProfilesByBuildingFromPostgres(buildingId)
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    role: r.role,
    phone: r.phone,
    activeMembershipsCount: r.active_memberships_count,
  }))
}
```

Tipo nuevo en `lib/types.ts`:

```ts
export type IAdminLinkableProfile = {
  id: string
  email: string
  fullName: string
  role: 'vecino' | 'propietario'
  phone: string | null
  activeMembershipsCount: number
}
```

### 2. Server action nueva

Archivo: `app/iadmin/consorcios/[id]/actions.ts`

```ts
const linkExistingProfileSchema = z.object({
  unitId: z.string().uuid(),
  profileId: z.string().uuid(),
  relationshipType: z.enum(['propietario', 'vecino_principal', 'vecino_adicional']),
  isPrimaryOwner: z.boolean().optional().default(false),
})

export async function linkExistingProfileToUnit(input: z.input<typeof linkExistingProfileSchema>) {
  const parsed = linkExistingProfileSchema.parse(input)

  const scope = await getUnitFullScopeFromPostgres(parsed.unitId)
  if (!scope) throw new Error('Unidad no encontrada')

  const { profile: actor } = await requireIAdmin({
    capability: 'holders.manage',
    administrationId: scope.administrationId,
  })

  const target = await getProfileByIdFromPostgres(parsed.profileId)
  if (!target) throw new Error('Vecino no encontrado')
  if (target.building_id !== scope.buildingId) {
    throw new Error('El vecino no pertenece a este consorcio')
  }

  if (parsed.relationshipType === 'vecino_principal') {
    await deactivateActivePrincipalMembershipsInPostgres(scope.unitId)
  }

  const existing = await findUnitProfileMembershipFromPostgres({
    unitId: scope.unitId,
    profileId: parsed.profileId,
    relationshipType: parsed.relationshipType,
  })

  await upsertUnitProfileMembershipInPostgres({
    membershipId: existing?.id ?? null,
    unitId: scope.unitId,
    buildingId: scope.buildingId,
    profileId: parsed.profileId,
    relationshipType: parsed.relationshipType,
    isPrimary: parsed.relationshipType === 'propietario' ? parsed.isPrimaryOwner : false,
    createdByProfileId: actor.id,
  })

  if (parsed.relationshipType === 'propietario') {
    const existingHolder = await findOwnerHolderForProfileFromPostgres({
      unitId: scope.unitId,
      profileId: parsed.profileId,
    })
    if (!existingHolder) {
      await insertOwnerHolderInPostgres({
        unitId: scope.unitId,
        profileId: parsed.profileId,
        fullName: target.full_name,
        email: target.email.toLowerCase(),
        phone: target.phone ?? null,
      })
    }
  }

  await insertIAdminAuditLogInPostgres({
    administrationId: scope.administrationId,
    actorProfileId: actor.id,
    entityType: 'unit_profile_memberships',
    entityId: scope.unitId,
    action: 'unit_user.linked_existing',
    metadata: {
      unit_code: scope.unitCode,
      profile_id: parsed.profileId,
      relationship_type: parsed.relationshipType,
    },
  })

  revalidatePath(`/iadmin/consorcios/${scope.managedPropertyId}`)
  return { profileId: parsed.profileId }
}
```

Diferencia clave con `createUnitUser`: **no toca Cognito ni `profiles`**, asume que el profile ya existe y solo crea el `unit_profile_membership` (+ holder si corresponde).

Si `getProfileByIdFromPostgres` no existe en `lib/db/profiles.ts`, agregarla:

```ts
export async function getProfileByIdFromPostgres(id: string) {
  const result = await pgQuery(
    `select id, email, full_name, role, building_id, phone from countrify.profiles where id = $1 limit 1`,
    [id],
  )
  return result.rows[0] ?? null
}
```

### 3. UI

Archivo: `components/admin-backoffice/consorcio/units-manager.tsx`

En el drawer/sección de "Agregar usuario a la unidad" (hoy solo tiene el form de creación), agregar arriba una sección "Vincular vecino existente":

- Combobox / select con la lista de `linkableProfiles` filtrada por:
  - Texto (nombre o email) — `Command` de shadcn anda perfecto.
  - Mostrar como subtítulo `email · {activeMembershipsCount === 0 ? 'sin unidad' : `${activeMembershipsCount} unidad(es)`}`.
- Select de `relationshipType` (los mismos 3 valores que el form actual).
- Checkbox `isPrimaryOwner` si la relación es `propietario`.
- Botón "Vincular" → llama `linkExistingProfileToUnit`.

Debajo, separador "o", y el form actual de creación nueva intacto (sigue siendo necesario para el caso "el vecino no existe todavía").

La prop `linkableProfiles: IAdminLinkableProfile[]` se inyecta desde el server component padre (`gestion/page.tsx`) llamando a `getIAdminLinkableProfiles(detail.property.buildingId)`.

### 4. Cargar desde el server component

`app/iadmin/consorcios/[id]/gestion/page.tsx`:

```ts
const [detail, unitsWithHolders, linkableProfiles] = await Promise.all([
  getIAdminConsorcioDetail(id),
  getIAdminUnitsWithHolders(id),
  getIAdminLinkableProfiles(detail.property.buildingId), // ← reordenar para que detail exista antes
])
```

(En la práctica hay que hacerlo en dos pasos: primero `getIAdminConsorcioDetail` para tener el `buildingId`, después `Promise.all` con las otras dos.)

Pasar `linkableProfiles` a `<ConsorcioDetail>` y de ahí a `<UnitsManager>`.

## Criterios de aceptación

1. Como superadmin creo un profile con `role = vecino` y `buildingId = B1`. **No lo vinculo a ninguna unidad.**
2. Entro como iadmin del consorcio cuyo building es B1, voy a Gestión → unidad U1 → "Agregar usuario".
3. Veo al vecino del paso 1 en el selector "Vincular vecino existente", con el badge "sin unidad".
4. Lo selecciono, elijo `vecino_principal`, click Vincular.
5. El vecino entra a Countrify/Citify y ve U1 en "Mi unidad".
6. Vuelvo al iadmin: el selector ya no muestra a ese vecino como "sin unidad" (ahora dice "1 unidad").
7. Audit log: aparece la acción `unit_user.linked_existing` con `profile_id` y `unit_code`.

## No incluido en este spec (deuda separada)

- Editar/desactivar/resetear password de usuarios desde superadmin.
- Drill-down "ver usuarios de este consorcio" dentro del detalle de un consorcio en superadmin.
- Mover un profile entre buildings.

## Diferencias Countrify ↔ Citify a chequear al portar

- **Schema SQL**: `countrify.*` vs `citify.*` en cada query.
- **Cognito pool**: Countrify usa dual-pool (vecinos en pool primary, negocios en pool fallback). En esta feature **no se toca Cognito** así que es agnóstico.
- **Roles**: ambos lados comparten `vecino`/`propietario`/`consorcio_admin`. Verificar que `UserRole` en `lib/types.ts` coincida.
- **Capability `holders.manage`**: confirmar que existe en `lib/iadmin/capabilities.ts` de Citify con el mismo nombre.
