# Countrify y Citify en el mismo VPS

Cómo conviven los dos productos. Leer **antes** de desplegar Citify, y tenerlo
en cuenta al provisionar Postgres para Countrify: la decisión se toma el día uno.

## La restricción que manda

`businesses` y `promotions` son **compartidas**: una misma fila se muestra en
los dos productos. Un negocio se da de alta una vez y aparece en Countrify y en
Citify.

Eso obliga a **una sola base de datos**. Postgres no soporta claves foráneas
entre bases distintas, y hay cinco FKs que cruzan:

```
countrify.profiles                     -> shared.businesses
countrify.promotion_redemption_tokens  -> shared.businesses
countrify.promotion_redemption_tokens  -> shared.promotions
countrify.promotion_redemptions        -> shared.promotions
countrify.saved_promotions             -> shared.promotions
```

Citify va a tener las cinco equivalentes desde su propio schema.

## La estructura

Una base, tres schemas:

| Schema | Contenido | Quién escribe |
|---|---|---|
| `shared` | `businesses`, `promotions` | los dos productos |
| `countrify` | las 47 tablas de Countrify | solo Countrify |
| `citify` | las tablas de Citify | solo Citify |

Cuatro roles: `countrify_admin` / `countrify_app` y `citify_admin` / `citify_app`.
Cada rol de runtime tiene `usage` sobre su propio schema **y** sobre `shared`,
y nada sobre el schema del otro producto.

El `search_path` de cada app lo arma `lib/db/postgres.ts` desde `DB_SCHEMA`:
`<schema del producto>, shared, public`.

## Por qué no se deja como estaba en AWS

En AWS las tablas compartidas vivían dentro del schema de Citify (`public`) y
Countrify las leía de ahí. Eso ataba un producto al schema del otro: las tablas
quedaban propiedad de `citify_admin` y cada migración de Countrify chocaba con
errores de permisos. Está documentado en `scripts/migrate-prod.sh`.

Un schema `shared` explícito, con ambos roles con permiso, hace que compartir
sea intencional y visible en vez de un efecto lateral.

## Dos columnas sin clave foránea, a propósito

`shared.businesses.owner_profile_id` y `shared.promotions.building_id` **no**
tienen FK, y no es un olvido.

Las dos apuntan a tablas que son de cada producto: los perfiles y los buildings
(countries en Countrify, edificios en Citify). Una fila compartida no puede
tener una FK a una tabla que existe por duplicado: apuntaría a uno de los dos y
rompería el alta desde el otro.

La integridad la sostiene la aplicación. Si en algún momento molesta, la salida
limpia es una tabla de vínculo por producto (`countrify.business_owners`,
`citify.business_owners`) en vez de una columna en la tabla compartida.

## Al sumar Citify

1. `create schema citify` y los dos roles, con `usage` sobre `citify` y `shared`.
2. Correr su bootstrap con `SCHEMA=citify` (el transformador hay que
   parametrizarlo: hoy tiene el nombre `countrify` en ~45 lugares).
3. **No** volver a crear `businesses` ni `promotions`: ya existen en `shared`.
   El archivo de Citify sí las crea, así que hay que sacarlas de su bootstrap.
4. Su servicio en `citify/compose.yml`, con `apps_net` como red externa.
5. Un archivo en `caddy/sites/citify.caddy`.

**Antes de empezar**: un restore verificado del backup de Countrify sobre una
base descartable. Para entonces Countrify va a ser el único con datos reales, y
todo el trabajo riesgoso va a estar corriendo sobre su infraestructura. Un
`docker compose down -v` mal puesto se lleva el volumen de Postgres con todo
adentro.
