-- Reset only CITIFY demo/mock data without touching schema objects.
-- Run this before re-running 20260416_demo_users.sql.

begin;

delete from public.complaint_case_message_mentions
where message_id in (
  select id
  from public.complaint_case_messages
  where author_profile_id in (
      select id from auth.users where lower(email) like '%@citify.test'
    )
    or case_id in (
      select id
      from public.complaint_cases
      where author_profile_id in (
          select id from auth.users where lower(email) like '%@citify.test'
        )
        or title in (
          'Ascensor principal con ruidos',
          'Luces del hall intermitentes',
          'Puerta del SUM no cierra bien'
        )
    )
);

delete from public.complaint_case_events
where case_id in (
  select id
  from public.complaint_cases
  where author_profile_id in (
      select id from auth.users where lower(email) like '%@citify.test'
    )
    or title in (
      'Ascensor principal con ruidos',
      'Luces del hall intermitentes',
      'Puerta del SUM no cierra bien'
    )
);

delete from public.complaint_case_messages
where author_profile_id in (
    select id from auth.users where lower(email) like '%@citify.test'
  )
  or case_id in (
    select id
    from public.complaint_cases
    where author_profile_id in (
        select id from auth.users where lower(email) like '%@citify.test'
      )
      or title in (
        'Ascensor principal con ruidos',
        'Luces del hall intermitentes',
        'Puerta del SUM no cierra bien'
      )
  );

delete from public.complaint_case_reasons
where case_id in (
  select id
  from public.complaint_cases
  where author_profile_id in (
      select id from auth.users where lower(email) like '%@citify.test'
    )
    or title in (
      'Ascensor principal con ruidos',
      'Luces del hall intermitentes',
      'Puerta del SUM no cierra bien'
    )
);

delete from public.complaint_cases
where author_profile_id in (
    select id from auth.users where lower(email) like '%@citify.test'
  )
  or title in (
    'Ascensor principal con ruidos',
    'Luces del hall intermitentes',
    'Puerta del SUM no cierra bien'
  );

delete from public.marketplace_items
where seller_profile_id in (
    select id from auth.users where lower(email) like '%@citify.test'
  )
  or title = 'Silla ergonomica demo';

delete from public.saved_promotions
where profile_id in (
    select id from auth.users where lower(email) like '%@citify.test'
  )
  or promotion_id in (
    select id
    from public.promotions
    where business_id in (
        select id
        from public.businesses
        where name in ('Urban Bistro', 'Tech Haven')
           or owner_profile_id in (
             select id from auth.users where lower(email) like '%@citify.test'
           )
      )
      or title in (
        '20% en brunch de fin de semana',
        '2x1 exclusivo Torre del Parque',
        '10% en accesorios'
      )
  );

delete from public.promotion_redemptions
where profile_id in (
    select id from auth.users where lower(email) like '%@citify.test'
  )
  or promotion_id in (
    select id
    from public.promotions
    where business_id in (
        select id
        from public.businesses
        where name in ('Urban Bistro', 'Tech Haven')
           or owner_profile_id in (
             select id from auth.users where lower(email) like '%@citify.test'
           )
      )
      or title in (
        '20% en brunch de fin de semana',
        '2x1 exclusivo Torre del Parque',
        '10% en accesorios'
      )
  );

delete from public.promotions
where business_id in (
    select id
    from public.businesses
    where name in ('Urban Bistro', 'Tech Haven')
       or owner_profile_id in (
         select id from auth.users where lower(email) like '%@citify.test'
       )
  )
  or title in (
    '20% en brunch de fin de semana',
    '2x1 exclusivo Torre del Parque',
    '10% en accesorios'
  );

update public.profiles
set business_id = null
where business_id in (
  select id
  from public.businesses
  where name in ('Urban Bistro', 'Tech Haven')
     or owner_profile_id in (
       select id from auth.users where lower(email) like '%@citify.test'
     )
);

delete from public.businesses
where name in ('Urban Bistro', 'Tech Haven')
   or owner_profile_id in (
     select id from auth.users where lower(email) like '%@citify.test'
   );

delete from public.building_admin_assignments
where profile_id in (
  select id from auth.users where lower(email) like '%@citify.test'
);

delete from auth.identities
where user_id in (
    select id from auth.users where lower(email) like '%@citify.test'
  )
  or lower(provider_id) like '%@citify.test';

delete from auth.users
where lower(email) like '%@citify.test';

delete from public.iadmin_managed_properties
where building_id in (
  select id
  from public.buildings
  where name in ('Torre del Parque', 'Edificio Central')
     or address in ('Av. Libertador 1234, CABA', 'Calle Corrientes 500, CABA')
  union
  select building_id
  from public.profiles
  where lower(email) like '%@citify.test'
    and building_id is not null
  union
  select building_id
  from public.building_admin_assignments
  where profile_id in (
    select id from auth.users where lower(email) like '%@citify.test'
  )
  union
  select building_id
  from public.promotions
  where title in (
    '20% en brunch de fin de semana',
    '2x1 exclusivo Torre del Parque',
    '10% en accesorios'
  )
    and building_id is not null
  union
  select building_id
  from public.complaint_cases
  where title in (
    'Ascensor principal con ruidos',
    'Luces del hall intermitentes',
    'Puerta del SUM no cierra bien'
  )
);

do $cleanup_building_refs$
declare
  ref record;
begin
  for ref in
    select distinct
      ns.nspname as schema_name,
      tbl.relname as table_name,
      col.attname as column_name
    from pg_constraint fk
    join pg_class tbl
      on tbl.oid = fk.conrelid
    join pg_namespace ns
      on ns.oid = tbl.relnamespace
    join unnest(fk.conkey) with ordinality as fk_cols(attnum, ord)
      on true
    join pg_attribute col
      on col.attrelid = tbl.oid
     and col.attnum = fk_cols.attnum
    where fk.contype = 'f'
      and fk.confrelid = 'public.buildings'::regclass
      and ns.nspname = 'public'
      and tbl.relname <> 'buildings'
  loop
    execute format(
      'delete from %I.%I where %I in (
         select id
         from public.buildings
         where name in (''Torre del Parque'', ''Edificio Central'')
       )',
      ref.schema_name,
      ref.table_name,
      ref.column_name
    );
  end loop;
end;
$cleanup_building_refs$;

delete from public.buildings
where name in ('Torre del Parque', 'Edificio Central');

commit;

select
  (select count(*) from auth.users where lower(email) like '%@citify.test') as remaining_demo_auth_users,
  (select count(*) from public.profiles where lower(email) like '%@citify.test') as remaining_demo_profiles,
  (select count(*) from public.businesses where name in ('Urban Bistro', 'Tech Haven')) as remaining_demo_businesses,
  (select count(*) from public.buildings where name in ('Torre del Parque', 'Edificio Central')) as remaining_demo_buildings,
  (select count(*) from public.promotions where title in ('20% en brunch de fin de semana', '2x1 exclusivo Torre del Parque', '10% en accesorios')) as remaining_demo_promotions,
  (select count(*) from public.marketplace_items where title = 'Silla ergonomica demo') as remaining_demo_marketplace_items,
  (select count(*) from public.complaint_cases where title in ('Ascensor principal con ruidos', 'Luces del hall intermitentes', 'Puerta del SUM no cierra bien')) as remaining_demo_cases;
