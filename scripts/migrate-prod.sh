#!/usr/bin/env bash
# Aplica UNA migración SQL a la RDS de Countrify (schema countrify) vía ECS run-task,
# porque la RDS es privada y no se alcanza desde local. Este es el camino OFICIAL de
# migraciones de Countrify (la GitHub Action migrate.yml se abandonó: corría como
# countrify_app y fallaba por ownership — las tablas base del schema countrify son
# propiedad de citify_admin, así que ALTER/DROP/GRANT daban "must be owner").
#
# Uso normal (DDL que NO toca tablas de citify_admin, p.ej. crear objetos nuevos):
#   bash scripts/migrate-prod.sh db/migrations/20260528_iadmin_ledger_foundation.sql
#
# Uso como citify_admin (DDL sobre tablas base: ALTER profiles, GRANT, DROP, etc.):
#   DB_USER_OVERRIDE=citify_admin  ADMIN_SECRET_ID=_tmp/admin-pw \
#     bash scripts/migrate-prod.sh db/migrations/20260608_email_events_and_resend.sql
#   ADMIN_SECRET_ID es una KEY de S3 en countrify-prod-assets con el password en
#   texto plano. Subir ANTES y BORRAR DESPUÉS:
#     aws secretsmanager get-secret-value --secret-id citify/prod/db-password \
#       --query SecretString --output text | aws s3 cp - s3://countrify-prod-assets/_tmp/admin-pw
#     ... correr la migración ...
#     aws s3 rm s3://countrify-prod-assets/_tmp/admin-pw
#
# Requiere: aws cli logueado como countrify-deploy (ya configurado en esta máquina).
#
# IMPORTANTE: las migraciones de db/migrations/2026052[89]*, 0530*, 0603* YA fueron
# adaptadas de public.* a countrify.* (auth.uid() se deja igual). Correr en orden
# cronológico. La de drop_propietario_role modifica datos (propietario->vecino).
set -euo pipefail
export MSYS_NO_PATHCONV=1
REGION=us-east-1
CLUSTER=citify-prod-cluster
SERVICE=countrify-prod-service
BUCKET=countrify-prod-assets
NET='awsvpcConfiguration={subnets=[subnet-08be2fd4a6a2ac3d2,subnet-06b65507a4711bfc5,subnet-0126fd3fb0efdd889],securityGroups=[sg-0387fd2e1b5bfccd7],assignPublicIp=ENABLED}'
FILE="${1:?uso: migrate-prod.sh <archivo.sql>}"
[ -f "$FILE" ] || { echo "no existe $FILE"; exit 1; }
DB_USER_OVERRIDE="${DB_USER_OVERRIDE:-}"
ADMIN_SECRET_ID="${ADMIN_SECRET_ID:-}"

aws s3 cp "$FILE" "s3://$BUCKET/_tmp/migration.sql" --region "$REGION"
TD=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" --region "$REGION" --query 'services[0].taskDefinition' --output text)
echo "task def: $TD"
[ -n "$DB_USER_OVERRIDE" ] && echo "conectando como: $DB_USER_OVERRIDE (override)"

JS="(async()=>{const{S3Client,GetObjectCommand}=require('@aws-sdk/client-s3');const{Pool}=require('pg');const s3=new S3Client({region:'us-east-1'});const r=await s3.send(new GetObjectCommand({Bucket:'$BUCKET',Key:'_tmp/migration.sql'}));const c=[];for await(const x of r.Body)c.push(x);const sql=Buffer.concat(c).toString('utf8');let user=process.env.DB_USER,pass=process.env.DB_PASSWORD;const adminSecret='$ADMIN_SECRET_ID';const userOv='$DB_USER_OVERRIDE';if(userOv)user=userOv;if(adminSecret){const pw=await s3.send(new GetObjectCommand({Bucket:'$BUCKET',Key:adminSecret}));const pc=[];for await(const x of pw.Body)pc.push(x);pass=Buffer.concat(pc).toString('utf8').trim()}const p=new Pool({host:process.env.DB_HOST,port:5432,database:process.env.DB_NAME,user,password:pass,ssl:{rejectUnauthorized:false}});await p.query(sql);console.log('migration applied (user='+user+')');await p.end()})().catch(e=>{console.error('ERR',e.message||e);process.exit(1)})"

# override JSON vía node (evita líos de escaping); path Windows absoluto para aws.exe
node -e "require('fs').writeFileSync('ov.json',JSON.stringify({containerOverrides:[{name:'countrify-web',command:['node','-e',process.argv[1]]}]}))" "$JS"
OVPATH="file://$(pwd -W 2>/dev/null || pwd)/ov.json"

TASK_ARN=$(aws ecs run-task --cluster "$CLUSTER" --task-definition "$TD" --launch-type FARGATE \
  --network-configuration "$NET" --overrides "$OVPATH" --region "$REGION" \
  --query 'tasks[0].taskArn' --output text)
rm -f ov.json
TID="${TASK_ARN##*/}"
echo "task: $TID"
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TID" --region "$REGION"
EXIT=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TID" --region "$REGION" --query 'tasks[0].containers[0].exitCode' --output text)
echo "exitCode: $EXIT"
echo "---- logs ----"
aws logs get-log-events --log-group-name /ecs/countrify-prod-web --log-stream-name "ecs/countrify-web/$TID" \
  --region "$REGION" --query 'events[].message' --output text 2>/dev/null || \
  aws logs filter-log-events --log-group-name /ecs/countrify-prod-web --region "$REGION" \
    --start-time $(( ($(date +%s) - 300) * 1000 )) --query 'events[].message' --output text 2>/dev/null || echo "(sin logs)"
[ "$EXIT" = "0" ]
