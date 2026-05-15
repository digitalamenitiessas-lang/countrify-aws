#!/bin/bash
set +e

PSQL_CONN="host=citify-prod-db.cyhi4wiiax9v.us-east-1.rds.amazonaws.com port=5432 user=citify_admin dbname=citify sslmode=require"

# Wait for psql
for i in $(seq 1 24); do
  if [ -f /tmp/bastion-ready ] && command -v psql >/dev/null 2>&1; then break; fi
  sleep 5
done

if ! command -v psql >/dev/null 2>&1; then
  echo "[error] psql not installed"
  exit 1
fi

echo "[step] downloading SQL"
aws s3 cp s3://countrify-prod-assets/_temp/countrify-schema.sql /tmp/countrify-schema-orig.sql --region us-east-1 --quiet

echo "[step] patching: create index -> create index if not exists"
sed -E 's/^create (unique )?index ([^i ])/create \1index if not exists \2/i' /tmp/countrify-schema-orig.sql > /tmp/countrify-schema.sql
echo "[step] patched indexes count:"
grep -c "create.*index if not exists" /tmp/countrify-schema.sql

echo "[step] fetching admin password"
PGPASSWORD=$(aws secretsmanager get-secret-value --secret-id countrify/_temp/migration-admin-password --region us-east-1 --query SecretString --output text)
export PGPASSWORD

echo "[step] reset schema countrify"
psql "${PSQL_CONN}" <<SQL
drop schema if exists countrify cascade;
create schema countrify authorization countrify_app;
SQL

echo "[step] PASS 1 (errors will accumulate, that's OK)"
psql "${PSQL_CONN}" -f /tmp/countrify-schema.sql > /tmp/pass1.log 2>&1
echo "[step] pass1 errors:"
grep -cE "^psql.*ERROR" /tmp/pass1.log
echo "[step] pass1 unique error types (top 15):"
grep -oE "ERROR:[^$]*" /tmp/pass1.log | sort -u | head -n 15

echo "[step] PASS 2"
psql "${PSQL_CONN}" -f /tmp/countrify-schema.sql > /tmp/pass2.log 2>&1
echo "[step] pass2 errors:"
grep -cE "^psql.*ERROR" /tmp/pass2.log
echo "[step] pass2 unique error types (top 15):"
grep -oE "ERROR:[^$]*" /tmp/pass2.log | sort -u | head -n 15

echo "[step] tables count in countrify:"
psql "${PSQL_CONN}" -c "select count(*) as tables from information_schema.tables where table_schema = 'countrify';"

echo "[step] functions count in countrify:"
psql "${PSQL_CONN}" -c "select count(*) as functions from information_schema.routines where routine_schema = 'countrify';"

echo "[step] indexes count:"
psql "${PSQL_CONN}" -c "select count(*) as indexes from pg_indexes where schemaname = 'countrify';"

echo "[step] types in countrify:"
psql "${PSQL_CONN}" -c "select typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='countrify' order by typname;"

echo "[step] sample tables:"
psql "${PSQL_CONN}" -c "select table_name from information_schema.tables where table_schema = 'countrify' order by table_name;"

echo "[step] catalog rows:"
psql "${PSQL_CONN}" -c "select (select count(*) from countrify.complaint_reason_catalog) as reasons, (select count(*) from countrify.iadmin_capabilities) as capabilities;"

echo "[step] grant privileges to countrify_app"
psql "${PSQL_CONN}" <<SQL
grant usage on schema countrify to countrify_app;
grant all privileges on all tables in schema countrify to countrify_app;
grant all privileges on all sequences in schema countrify to countrify_app;
grant all privileges on all functions in schema countrify to countrify_app;
alter default privileges in schema countrify grant all privileges on tables to countrify_app;
alter default privileges in schema countrify grant all privileges on sequences to countrify_app;
alter default privileges in schema countrify grant all privileges on functions to countrify_app;
grant references on table public.businesses to countrify_app;
grant references on table public.promotions to countrify_app;
SQL

echo "[done]"
