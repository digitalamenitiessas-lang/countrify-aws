-- GENERADO por scripts/db/build-schema.mjs desde db/migrations/20260922_local_auth.sql

-- ---------------------------------------------------------------------------
-- Auth propia: la contraseña pasa a vivir en la base.
--
-- Contexto: se borro la cuenta de AWS y con ella el user pool de Cognito, que
-- era el que guardaba las credenciales. El login ahora verifica un hash argon2
-- guardado en countrify.profiles (lib/auth/password.ts).
--
-- Nullable a proposito: un profile sin hash simplemente no puede loguear. Eso
-- cubre los perfiles que se crean vinculados a una unidad antes de tener
-- credenciales, y deja que el flujo de "olvide mi contraseña" sea la via para
-- darles acceso.
--
-- El indice unico sobre lower(email) NO va aca: ya lo crea
-- db/migrations/20260921_restore_orphan_objects.sql.
-- ---------------------------------------------------------------------------

alter table countrify.profiles
  add column if not exists password_hash text;



comment on column countrify.profiles.password_hash is
  'Hash argon2id (formato PHC) de la contraseña. Null = la cuenta no puede iniciar sesion.';
