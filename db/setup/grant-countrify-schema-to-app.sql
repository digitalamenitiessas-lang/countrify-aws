-- Setup one-off: dar permisos al user countrify_app sobre el schema countrify.
-- Correr UNA VEZ como citify_admin (o el owner del schema countrify).
--
-- Despues de esto, el workflow migrate-prod estandar puede aplicar migraciones
-- a countrify.* sin permission denied.

grant create, usage on schema countrify to countrify_app;

-- Permisos sobre TODO lo que ya existe (por las dudas).
grant all on all tables in schema countrify to countrify_app;
grant all on all sequences in schema countrify to countrify_app;
grant execute on all functions in schema countrify to countrify_app;

-- Permisos sobre lo que se cree de aca en adelante (default privileges).
-- Ojo: alter default privileges aplica a objetos creados POR el role que ejecuta
-- esta sentencia. Si las migraciones van a correr desde countrify_app, los
-- objetos quedan owned por countrify_app y este alter no hace falta. Lo dejo
-- por simetria con tablas creadas por citify_admin si vuelve a pasar.
alter default privileges in schema countrify
  grant all on tables to countrify_app;
alter default privileges in schema countrify
  grant all on sequences to countrify_app;

-- Verificacion: estos selects deberian devolver al menos las dos tablas que
-- vamos a crear, una vez aplicada la migracion building_announcements.
-- select tablename from pg_tables where schemaname = 'countrify' order by tablename;
