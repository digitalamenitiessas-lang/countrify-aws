-- Simplificacion del modelo: el responsable financiero unico de la unidad es
-- el "vecino principal". Eliminamos el rol "propietario" como cuenta (login) y
-- como relacion de membresia, conservando 'propietario' solo como dato legal
-- en iadmin_unit_holders.holder_kind (quien figura en el reglamento).
--
-- Postgres no permite eliminar valores de un enum facilmente. Dejamos los
-- valores 'propietario' en app_role y unit_profile_relationship como
-- deprecados (no se usan mas en codigo) y migramos toda la data existente a
-- los valores nuevos.

-- 1) Memberships: pasar propietario -> vecino_principal evitando duplicados.
--    Si una (unit, profile) ya tiene una membership vecino_principal activa,
--    descartamos la propietario; si no, la convertimos.
with promote as (
  select m.id
    from public.unit_profile_memberships m
   where m.relationship_type = 'propietario'
     and not exists (
       select 1
         from public.unit_profile_memberships m2
        where m2.unit_id = m.unit_id
          and m2.profile_id = m.profile_id
          and m2.relationship_type = 'vecino_principal'
          and m2.active
     )
)
update public.unit_profile_memberships m
   set relationship_type = 'vecino_principal'::public.unit_profile_relationship,
       is_primary = false
  from promote
 where m.id = promote.id;

update public.unit_profile_memberships
   set active = false
 where relationship_type = 'propietario'
   and active = true;

-- 2) Profiles: rol propietario -> vecino. Si ya existe el valor 'vecino' en
--    el enum app_role (lo agrega 20260425) podemos hacer el cast directo.
update public.profiles
   set role = 'vecino'::public.app_role
 where role::text = 'propietario';

-- 3) Reemplazar funciones que dependian de relationship_type='propietario'.
--    Ahora apuntan a 'vecino_principal' (la unica relacion responsable del
--    pago). 'current_user_owns_unit' / 'current_user_owns_liquidation_run'
--    se mantienen por compatibilidad de API pero semantica = vecino principal.

create or replace function public.current_user_owns_unit(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.unit_profile_memberships m
    where m.unit_id = target_unit_id
      and m.profile_id = auth.uid()
      and m.relationship_type = 'vecino_principal'
      and m.active
  )
$$;

create or replace function public.current_user_owns_liquidation_run(target_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.iadmin_liquidation_items li
    join public.unit_profile_memberships m on m.unit_id = li.unit_id
    where li.liquidation_run_id = target_run_id
      and m.profile_id = auth.uid()
      and m.relationship_type = 'vecino_principal'
      and m.active
  )
$$;

-- 4) Trigger de validacion: ya no permitir nuevas membresias 'propietario'.
--    Las que existen (forzadas inactivas arriba) quedan congeladas.
create or replace function public.validate_unit_profile_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_building uuid;
  v_profile_role text;
  v_profile_building_id uuid;
begin
  v_expected_building := public.iadmin_unit_building_id(new.unit_id);
  if v_expected_building is null then
    raise exception 'La unidad no existe o no esta vinculada a un edificio.';
  end if;

  if new.building_id <> v_expected_building then
    raise exception 'La unidad no pertenece al edificio indicado.';
  end if;

  select p.role::text, p.building_id
  into v_profile_role, v_profile_building_id
  from public.profiles p
  where p.id = new.profile_id;

  if v_profile_role is null then
    raise exception 'El perfil indicado no existe.';
  end if;

  if new.relationship_type = 'propietario' then
    raise exception 'El rol propietario fue retirado del sistema. Use vecino_principal.';
  end if;

  if new.relationship_type in ('vecino_principal', 'vecino_adicional') and v_profile_role <> 'vecino' then
    raise exception 'Una membresia vecinal requiere un perfil vecino.';
  end if;

  if v_profile_building_id is not null and v_profile_building_id <> new.building_id then
    raise exception 'El perfil indicado pertenece a otro edificio.';
  end if;

  if new.relationship_type = 'vecino_adicional'
    and new.active
    and (
      select count(*)::integer
      from public.unit_profile_memberships m
      where m.unit_id = new.unit_id
        and m.relationship_type = 'vecino_adicional'
        and m.active
        and (tg_op = 'INSERT' or m.id <> new.id)
    ) >= 4
  then
    raise exception 'La unidad ya tiene 4 vecinos adicionales activos.';
  end if;

  -- is_primary ya no se usa: lo forzamos a false siempre.
  new.is_primary := false;

  return new;
end;
$$;

-- 5) Policies de iadmin_liquidation_runs / items / payments que dejaban ver al
--    "propietario": ahora dejamos ver al "vecino_principal".

drop policy if exists "iadmin_liquidation_runs owner select" on public.iadmin_liquidation_runs;
create policy "iadmin_liquidation_runs owner select"
on public.iadmin_liquidation_runs for select
to authenticated
using (
  exists (
    select 1
    from public.iadmin_liquidation_items li
    join public.unit_profile_memberships m on m.unit_id = li.unit_id
    where li.liquidation_run_id = public.iadmin_liquidation_runs.id
      and m.profile_id = auth.uid()
      and m.relationship_type = 'vecino_principal'
      and m.active
  )
);

drop policy if exists "iadmin_liquidation_items owner select" on public.iadmin_liquidation_items;
create policy "iadmin_liquidation_items owner select"
on public.iadmin_liquidation_items for select
to authenticated
using (
  exists (
    select 1
    from public.unit_profile_memberships m
    where m.unit_id = public.iadmin_liquidation_items.unit_id
      and m.profile_id = auth.uid()
      and m.relationship_type = 'vecino_principal'
      and m.active
  )
);

drop policy if exists "iadmin_payments owner select" on public.iadmin_payments;
create policy "iadmin_payments owner select"
on public.iadmin_payments for select
to authenticated
using (
  unit_id is not null
  and exists (
    select 1
    from public.unit_profile_memberships m
    where m.unit_id = public.iadmin_payments.unit_id
      and m.profile_id = auth.uid()
      and m.relationship_type = 'vecino_principal'
      and m.active
  )
);
