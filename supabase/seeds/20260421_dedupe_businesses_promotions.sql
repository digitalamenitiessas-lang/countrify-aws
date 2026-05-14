-- Dedupe de businesses y promotions creado por re-ejecuciones del seed demo.
-- Regla: sólo se eliminan duplicados "vacíos" (sin imagen ni descripción útil).
-- Los duplicados con logo_path/image_path o con descripción no vacía se conservan.

begin;

-- 1) Promotions: agrupar por (business_id, title, discount).
--    Ranking: primero los que tienen image_path o descripción no vacía, luego el más antiguo.
--    Se borran sólo las filas "vacías" (sin image_path y descripción en blanco) que no sean la elegida.
with ranked as (
  select
    id,
    business_id,
    title,
    discount,
    image_path,
    description,
    row_number() over (
      partition by business_id, title, discount
      order by
        (image_path is not null) desc,
        (coalesce(btrim(description), '') <> '') desc,
        created_at asc
    ) as rn
  from public.promotions
),
to_delete as (
  select id
  from ranked
  where rn > 1
    and image_path is null
    and coalesce(btrim(description), '') = ''
)
delete from public.promotions p
using to_delete d
where p.id = d.id;

-- 2) Businesses: agrupar por (name, category).
--    Se conservan los que tienen logo_path o descripción no vacía.
--    Antes de borrar un business "vacío" duplicado, verificamos que no tenga promociones
--    (si tiene promos vivas, lo dejamos intacto para no perder data por cascade).
with ranked as (
  select
    id,
    name,
    category,
    logo_path,
    description,
    row_number() over (
      partition by name, category
      order by
        (logo_path is not null) desc,
        (coalesce(btrim(description), '') <> '') desc,
        created_at asc
    ) as rn
  from public.businesses
),
candidates as (
  select id
  from ranked
  where rn > 1
    and logo_path is null
    and coalesce(btrim(description), '') = ''
),
safe_to_delete as (
  select c.id
  from candidates c
  where not exists (select 1 from public.promotions pr where pr.business_id = c.id)
    and not exists (select 1 from public.profiles pf where pf.business_id = c.id)
)
delete from public.businesses b
using safe_to_delete s
where b.id = s.id;

commit;

-- Verificación post-limpieza (ejecutar aparte si querés ver el resultado):
-- select name, category, count(*) from public.businesses group by 1,2 having count(*) > 1;
-- select business_id, title, discount, count(*) from public.promotions group by 1,2,3 having count(*) > 1;
