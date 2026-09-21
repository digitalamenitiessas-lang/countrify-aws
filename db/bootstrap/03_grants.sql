-- ---------------------------------------------------------------------------
-- Permisos del usuario de runtime. Solo DML: la app nunca hace DDL.
-- Correr como countrify_admin (dueno del schema) despues de cada migracion.
-- ---------------------------------------------------------------------------

grant usage on schema countrify to countrify_app;

grant select, insert, update, delete on all tables    in schema countrify to countrify_app;
grant usage, select                 on all sequences  in schema countrify to countrify_app;
grant execute                       on all functions  in schema countrify to countrify_app;

-- Y sobre lo que se cree de aca en adelante.
alter default privileges in schema countrify
  grant select, insert, update, delete on tables to countrify_app;
alter default privileges in schema countrify
  grant usage, select on sequences to countrify_app;
alter default privileges in schema countrify
  grant execute on functions to countrify_app;
