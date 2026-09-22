-- ---------------------------------------------------------------------------
-- Roles de Countrify. Correr como superusuario, una sola vez por cluster.
-- Las passwords se pasan por variable de psql:
--   psql -v admin_pw="'...'" -v app_pw="'...'" -f db/bootstrap/00_roles.sql
-- ---------------------------------------------------------------------------

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'countrify_admin') then
    create role countrify_admin login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'countrify_app') then
    create role countrify_app login;
  end if;
end
$roles$;

alter role countrify_admin password :admin_pw;
alter role countrify_app   password :app_pw;
