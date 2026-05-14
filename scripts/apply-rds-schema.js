const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const repoRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const credentialsFile = "C:\\tmp\\citify-rds-credentials.txt";
const outputSqlFile = path.join(repoRoot, "scripts", "generated-rds-schema.sql");

function parseCredentialsFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return raw.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      return acc;
    }
    const [key, ...rest] = trimmed.split("=");
    acc[key] = rest.join("=");
    return acc;
  }, {});
}

function getDbConfig() {
  const fileCreds = parseCredentialsFile(credentialsFile);

  return {
    host: process.env.DB_HOST || fileCreds.DB_HOST || "citify-prod-db.cyhi4wiiax9v.us-east-1.rds.amazonaws.com",
    port: Number(process.env.DB_PORT || fileCreds.DB_PORT || 5432),
    database: process.env.DB_NAME || fileCreds.DB_NAME || "citify",
    user: process.env.DB_USER || process.env.DB_USERNAME || fileCreds.DB_USERNAME || "citify_admin",
    password: process.env.DB_PASSWORD || fileCreds.DB_PASSWORD,
    ssl:
      process.env.DB_SSL === "disable"
        ? false
        : {
            rejectUnauthorized: false,
          },
  };
}

function loadMigrationFiles() {
  const explicitOrder = [
    "20260415_initial.sql",
    "20260416_consorcio_multi_building.sql",
    "20260416_building_complaints.sql",
    "20260417_complaint_cases.sql",
    "20260417_iadmin_core.sql",
    "20260418_complaint_case_mentions.sql",
    "20260419_iadmin_liquidation_3b.sql",
    "20260420_iadmin_cash_accounts.sql",
    "20260420_locations.sql",
    "20260420_promotion_qr_monthly.sql",
    "20260421_iadmin_collections.sql",
    "20260422_iadmin_simplifications.sql",
    "20260423_iadmin_share_tokens.sql",
    "20260424_iadmin_recurring_reminders.sql",
    "20260425_units_roles_building_info.sql",
    "20260426_superadmin_create_consorcio.sql",
    "20260505_fix_promotion_qr_ambiguous_id.sql",
    "20260505_fix_promotion_qr_missing_generator.sql",
  ];

  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));
  const missing = files.filter((file) => !explicitOrder.includes(file));
  const ordered = [...explicitOrder, ...missing.sort((a, b) => a.localeCompare(b))];

  return ordered.map((file) => ({
    file,
    sql: fs.readFileSync(path.join(migrationsDir, file), "utf8"),
  }));
}

function buildPrelude() {
  return `
create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    execute 'create schema auth';
  end if;

  if not exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'create schema extensions';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select null::uuid
$$;
`;
}

function sanitizeSql(sql) {
  const lines = sql.split(/\r?\n/);
  const kept = [];

  let skipUntilSemicolon = false;

  for (const line of lines) {
    const normalized = line.trim().toLowerCase();

    if (skipUntilSemicolon) {
      if (normalized.endsWith(";")) {
        skipUntilSemicolon = false;
      }
      continue;
    }

    const startsStorageStatement =
      normalized.startsWith("insert into storage.") ||
      normalized.includes(" on storage.objects") ||
      normalized.startsWith("create policy") && normalized.includes("storage.objects") ||
      normalized.startsWith("drop policy") && normalized.includes("storage.objects");

    const skipKnownIncompatibleIndex =
      normalized.startsWith("create unique index if not exists iadmin_reminders_daily_unique");

    if (startsStorageStatement || skipKnownIncompatibleIndex) {
      if (!normalized.endsWith(";")) {
        skipUntilSemicolon = true;
      }
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n");
}

function buildSchemaSql() {
  const sections = [buildPrelude()];

  for (const migration of loadMigrationFiles()) {
    sections.push(`\n-- Migration: ${migration.file}\n`);
    sections.push(sanitizeSql(migration.sql));
    sections.push("\n");
  }

  return sections.join("\n");
}

async function applySchema() {
  const config = getDbConfig();
  if (!config.password) {
    throw new Error("No se encontro DB_PASSWORD para conectar a RDS.");
  }

  const sql = buildSchemaSql();
  fs.writeFileSync(outputSqlFile, sql, "utf8");

  const client = new Client(config);
  await client.connect();

  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  applySchema()
    .then(() => {
      console.log(`Schema aplicado correctamente. SQL generado en ${outputSqlFile}`);
    })
    .catch((error) => {
      console.error("Fallo aplicando schema RDS:");
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  buildSchemaSql,
  sanitizeSql,
};
