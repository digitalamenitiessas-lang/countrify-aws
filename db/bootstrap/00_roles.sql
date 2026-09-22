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

-- countrify_admin tiene que poder crear los schemas y ser DUEÑO de todo lo que
-- viene despues. Si el bootstrap corre como superusuario sin esto, el schema y
-- las 49 tablas quedan owned by postgres y countrify_admin no puede ni crear su
-- tabla de control de migraciones: la primera migracion futura muere con
-- "permission denied for schema countrify".
grant create, connect on database :"db" to countrify_admin;
grant connect on database :"db" to countrify_app;
