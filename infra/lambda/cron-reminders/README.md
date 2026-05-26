# Lambda: countrify-cron-generate-reminders

Lambda Node.js 20 que dispara diariamente el endpoint
`/api/cron/generate-reminders` de countrify.com.ar.

## Trigger

EventBridge rule `countrify-cron-reminders-daily` con schedule
`cron(0 12 * * ? *)` → 12:00 UTC = **09:00 ARG**.

## Auth

Lee el bearer desde Secrets Manager (`countrify/prod/cron-secret`)
en cada cold start (cached por warm container).

## Env vars

| Nombre | Valor |
|---|---|
| `TARGET_URL` | `https://countrify.com.ar/api/cron/generate-reminders` |
| `SECRET_ID` | `countrify/prod/cron-secret` |

## IAM role

`countrify-cron-lambda-role`:
- `AWSLambdaBasicExecutionRole` (logs)
- Inline `read-cron-secret`: `secretsmanager:GetSecretValue` sobre
  `arn:aws:secretsmanager:us-east-1:351885857894:secret:countrify/prod/cron-secret-*`

## Deploy manual

Las deps de AWS SDK v3 vienen bundled en el runtime Node 20, así que
solo se zippea `index.mjs`:

```sh
cd infra/lambda/cron-reminders
powershell -Command "Compress-Archive -Path index.mjs -DestinationPath function.zip -Force"
aws lambda update-function-code \
  --function-name countrify-cron-generate-reminders \
  --zip-file fileb://function.zip
rm function.zip
```

## Testing

```sh
# Invocación manual
aws lambda invoke \
  --function-name countrify-cron-generate-reminders \
  --payload '{}' \
  --cli-binary-format raw-in-base64-out \
  /tmp/out.json
cat /tmp/out.json
```

Logs en CloudWatch: `/aws/lambda/countrify-cron-generate-reminders`.
