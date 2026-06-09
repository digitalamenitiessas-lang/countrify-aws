#!/usr/bin/env bash
# Corre un .sql arbitrario en la RDS de Countrify via ECS run-task y muestra los
# resultados (rows como JSON). A diferencia de migrate-prod.sh, este NO asume que
# el SQL es DDL: imprime filas. Pensado para diagnostico / queries puntuales.
#
# Opcionalmente conecta con otro usuario (ej. citify_admin, dueno de las tablas
# base del schema, para correr ALTER/DROP que el app user no puede):
#   DB_USER_OVERRIDE=citify_admin  ADMIN_SECRET_ID=_tmp/admin-pw \
#     bash scripts/run-sql-prod.sh archivo.sql
# ADMIN_SECRET_ID es una KEY de S3 en countrify-prod-assets que contiene el
# password en texto plano (el task role lee countrify-prod-assets, no secrets
# citify/*, y el contenedor no trae el SDK de Secrets Manager). Subir y BORRAR:
#   aws secretsmanager get-secret-value --secret-id citify/prod/db-password \
#     --query SecretString --output text | aws s3 cp - s3://countrify-prod-assets/_tmp/admin-pw
#   ... correr ...
#   aws s3 rm s3://countrify-prod-assets/_tmp/admin-pw
#
# Uso:  bash scripts/run-sql-prod.sh /tmp/diag.sql
set -euo pipefail
export MSYS_NO_PATHCONV=1
REGION=us-east-1
CLUSTER=citify-prod-cluster
SERVICE=countrify-prod-service
BUCKET=countrify-prod-assets
NET='awsvpcConfiguration={subnets=[subnet-08be2fd4a6a2ac3d2,subnet-06b65507a4711bfc5,subnet-0126fd3fb0efdd889],securityGroups=[sg-0387fd2e1b5bfccd7],assignPublicIp=ENABLED}'
FILE="${1:?uso: run-sql-prod.sh <archivo.sql>}"
[ -f "$FILE" ] || { echo "no existe $FILE"; exit 1; }
DB_USER_OVERRIDE="${DB_USER_OVERRIDE:-}"
ADMIN_SECRET_ID="${ADMIN_SECRET_ID:-}"

aws s3 cp "$FILE" "s3://$BUCKET/_tmp/run-sql.sql" --region "$REGION"
TD=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" --region "$REGION" --query 'services[0].taskDefinition' --output text)
echo "task def: $TD"

JS="(async()=>{const{S3Client,GetObjectCommand}=require('@aws-sdk/client-s3');const{Pool}=require('pg');const s3=new S3Client({region:'us-east-1'});const r=await s3.send(new GetObjectCommand({Bucket:'$BUCKET',Key:'_tmp/run-sql.sql'}));const c=[];for await(const x of r.Body)c.push(x);const sql=Buffer.concat(c).toString('utf8');let user=process.env.DB_USER,pass=process.env.DB_PASSWORD;const adminSecret='$ADMIN_SECRET_ID';const userOv='$DB_USER_OVERRIDE';if(userOv)user=userOv;if(adminSecret){const pw=await s3.send(new GetObjectCommand({Bucket:'$BUCKET',Key:adminSecret}));const pc=[];for await(const x of pw.Body)pc.push(x);pass=Buffer.concat(pc).toString('utf8').trim()}const p=new Pool({host:process.env.DB_HOST,port:5432,database:process.env.DB_NAME,user,password:pass,ssl:{rejectUnauthorized:false}});const res=await p.query(sql);const out=Array.isArray(res)?res:[res];for(const rr of out){if(rr.command&&rr.rows&&rr.rows.length===0){console.log('['+rr.command+'] ok rows='+rr.rowCount)}else if(rr.rows){console.log(JSON.stringify(rr.rows))}}console.log('done');await p.end()})().catch(e=>{console.error('ERR',e.message||e);process.exit(1)})"

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
  --region "$REGION" --query 'events[].message' --output text 2>/dev/null || echo "(sin logs)"
[ "$EXIT" = "0" ]
