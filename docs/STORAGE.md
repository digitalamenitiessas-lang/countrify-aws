# Almacenamiento de archivos (S3-compatible)

Countrify guarda imagenes y comprobantes en un almacenamiento de objetos
S3-compatible. El codigo vive en `lib/storage/s3.ts` y funciona igual contra
**Cloudflare R2** o contra **MinIO** corriendo en el VPS: cambian solo el
endpoint y las credenciales, no el codigo.

Ya no se usa AWS S3. El modulo viejo era `lib/aws/s3.ts`.

---

## 1. Dos buckets, no uno

Antes lo publico y lo privado convivian en un solo bucket, separados por el
prefijo de la key (`public/...` vs `private/...`). **Eso no se puede hacer en R2
ni en MinIO**: el acceso publico se configura **por bucket**, no por prefijo. Con
un solo bucket marcado publico, todos los comprobantes de gastos y de pago de
los vecinos quedan descargables por cualquiera que adivine la key — son
documentos contables de un consorcio.

Por eso hay dos buckets:

| Bucket | Variable | Contenido | Acceso |
|---|---|---|---|
| Publico | `S3_PUBLIC_BUCKET` | Imagenes de marketplace, logos de negocios, imagenes de promociones | Lectura anonima por HTTP |
| Privado | `S3_PRIVATE_BUCKET` | Comprobantes de gastos (`private/expenses/...`) y de pago (`private/payment-claims/...`) | **Cerrado**. Solo se sirve por URL prefirmada de 5 minutos, despues de chequear permisos |

Nombres sugeridos: `countrify-public` y `countrify-private`.

Las keys siguen arrancando con `public/` y `private/`. Ya no son lo que decide
el acceso (eso lo decide el bucket), pero se conservan porque quedan guardadas
en la base y el codigo de lectura las usa como marca (`path.startsWith('public/')`).

**El bucket privado nunca se expone.** No le pongas dominio publico, no lo
marques de lectura anonima y no lo pongas detras del proxy. Se accede
exclusivamente por las URLs prefirmadas que genera el server.

---

## 2. Variables de entorno

Las mismas para R2 y para MinIO:

```bash
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_BUCKET=countrify-public
S3_PRIVATE_BUCKET=countrify-private
S3_PUBLIC_BASE_URL=https://archivos.countrify.com.ar
```

- `S3_REGION`: `auto` para R2. Para MinIO cualquier valor sirve mientras sea el
  mismo con el que se firma y se valida; usar `us-east-1` es lo convencional.
- `S3_PUBLIC_BASE_URL`: la base con la que se arman las URLs publicas. Se le
  concatena la key tal cual (`${base}/public/marketplace/...`). Sin barra final
  (si la lleva, el codigo la saca).
- `S3_ENDPOINT`: **el hostname publico**, no el interno. Ver la seccion 5.

El cliente se construye con `forcePathStyle: true` (R2 y MinIO no resuelven
`bucket.endpoint` como subdominio) y con
`requestChecksumCalculation: 'WHEN_REQUIRED'` (ver seccion 6).

---

## 3. Opcion A — Cloudflare R2

### Crear los buckets

1. Dashboard de Cloudflare -> R2 -> **Create bucket**.
2. Crear `countrify-public` y `countrify-private`. Location hint: `enam` o el
   mas cercano; no es critico.
3. R2 -> **Manage R2 API Tokens** -> Create API token, permiso
   *Object Read & Write*, alcance a esos dos buckets. Guardar el Access Key ID
   y el Secret Access Key: el secret se muestra una sola vez.
4. El endpoint sale en la misma pantalla:
   `https://<account-id>.r2.cloudflarestorage.com`.

### Servir el bucket publico

R2 no sirve objetos publicamente desde el endpoint S3. Hay dos formas:

- **Dominio propio (recomendado).** Bucket `countrify-public` -> Settings ->
  *Public access* -> **Connect Domain** -> `archivos.countrify.com.ar`.
  Cloudflare crea el CNAME solo si el dominio esta en esa cuenta.
  Entonces `S3_PUBLIC_BASE_URL=https://archivos.countrify.com.ar`.
- **Subdominio `r2.dev`.** Settings -> *Allow Access* en el bucket publico.
  Da una URL tipo `https://pub-<hash>.r2.dev`. Sirve para probar; tiene rate
  limit y Cloudflare no lo recomienda para produccion.

En `countrify-private` **no** habilitar ni dominio propio ni `r2.dev`.

### CORS en R2

Los 4 uploads hacen `PUT` desde el navegador contra el endpoint S3, asi que sin
CORS el preflight los mata. Se configura por bucket: Bucket -> Settings ->
**CORS Policy** -> Edit -> pegar el JSON.

Va **en los dos buckets**: el publico recibe imagenes, el privado recibe
comprobantes.

```json
[
  {
    "AllowedOrigins": [
      "https://countrify.com.ar",
      "https://www.countrify.com.ar",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type", "content-length"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

Cambiar `AllowedOrigins` por el dominio real donde corra la app. `localhost:3000`
solo mientras se desarrolla; sacarlo en produccion.

`content-length` tiene que estar en `AllowedHeaders` porque ahora va dentro de
la firma (ver seccion 7).

---

## 4. Opcion B — MinIO en el VPS

Util el dia uno: no hay que crear cuenta en ningun lado.

### Levantarlo

```yaml
# docker-compose.yml
services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    restart: unless-stopped
    environment:
      MINIO_ROOT_USER: countrify
      MINIO_ROOT_PASSWORD: <password-largo>
      # Que MinIO firme y valide con el hostname publico. Ver seccion 5.
      MINIO_SERVER_URL: https://archivos.countrify.com.ar
      MINIO_BROWSER_REDIRECT_URL: https://consola-archivos.countrify.com.ar
    volumes:
      - ./minio-data:/data
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
```

Los puertos van atados a `127.0.0.1`: MinIO no se expone directo, sale por nginx.

### Crear los buckets y las credenciales

Con el cliente `mc` (`brew install minio/stable/mc` en Mac, o el binario en el VPS):

```bash
mc alias set countrify https://archivos.countrify.com.ar countrify '<password-largo>'

mc mb countrify/countrify-public
mc mb countrify/countrify-private

# El publico, de lectura anonima. El privado NO lleva ninguna policy.
mc anonymous set download countrify/countrify-public

# Usuario de la app con permiso solo sobre esos dos buckets.
mc admin user add countrify countrify-app '<secret-largo>'
mc admin policy attach countrify readwrite --user countrify-app
```

`S3_ACCESS_KEY_ID=countrify-app` y `S3_SECRET_ACCESS_KEY=<secret-largo>`.
No usar las credenciales root de MinIO para la app.

### CORS en MinIO

```bash
cat > /tmp/cors.json <<'JSON'
[
  {
    "AllowedOrigin": ["https://countrify.com.ar", "https://www.countrify.com.ar"],
    "AllowedMethod": ["GET", "PUT", "HEAD"],
    "AllowedHeader": ["content-type", "content-length"],
    "ExposeHeader": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
JSON

mc cors set countrify/countrify-public /tmp/cors.json
mc cors set countrify/countrify-private /tmp/cors.json
mc cors get countrify/countrify-public
```

En versiones de `mc` sin el subcomando `cors`, se setea con
`MINIO_API_CORS_ALLOW_ORIGIN` en el environment del contenedor
(lista separada por comas, sin metodos ni headers configurables):

```yaml
MINIO_API_CORS_ALLOW_ORIGIN: "https://countrify.com.ar,https://www.countrify.com.ar"
```

### nginx delante

```nginx
server {
    listen 443 ssl http2;
    server_name archivos.countrify.com.ar;

    # Los comprobantes llegan hasta 15 MB. El default de nginx es 1 MB y
    # devuelve 413 antes de que el PUT toque MinIO.
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
        proxy_http_version 1.1;
    }
}
```

`proxy_set_header Host $host` es obligatorio: si nginx reescribe el Host a
`127.0.0.1:9000`, MinIO valida la firma contra ese host y da 403.

Con MinIO, `S3_PUBLIC_BASE_URL` incluye el bucket, porque el acceso es path-style:

```bash
S3_ENDPOINT=https://archivos.countrify.com.ar
S3_PUBLIC_BASE_URL=https://archivos.countrify.com.ar/countrify-public
```

---

## 5. El detalle de MinIO que rompe a todo el mundo

**La URL prefirmada tiene que firmarse con el hostname publico con el que va a
pegar el navegador, no con el nombre interno del contenedor.**

La firma SigV4 incluye el header `host`. Si el SDK arma la URL con
`http://minio:9000` (el nombre del servicio en la red de Docker), la firma se
calcula sobre `host: minio:9000`. El navegador despues pega a
`https://archivos.countrify.com.ar`, el server recalcula la firma con
`host: archivos.countrify.com.ar`, no coincide y devuelve
**403 SignatureDoesNotMatch**.

El sintoma es confuso: el endpoint de presign responde 200 y todo parece bien,
pero el `PUT` falla siempre.

Las dos puntas tienen que apuntar al hostname publico:

- `S3_ENDPOINT=https://archivos.countrify.com.ar` en la app.
- `MINIO_SERVER_URL=https://archivos.countrify.com.ar` en MinIO.
- nginx pasando el `Host` original (`proxy_set_header Host $host`).

No importa que la app y MinIO esten en el mismo VPS: el trafico igual tiene que
salir y volver por el hostname publico, o la firma no valida.

En R2 esto no pasa porque el endpoint S3 es siempre el publico.

---

## 6. El bug del checksum (no sacar `requestChecksumCalculation`)

Desde `@aws-sdk/client-s3` 3.1045 el SDK manda *flexible checksums* (CRC32) por
defecto en todos los `PutObject`. Al prefirmar, eso mete
`x-amz-checksum-crc32` y `x-amz-sdk-checksum-algorithm` en los headers firmados.
El navegador no manda esos headers, y R2/MinIO devuelven **400, firma invalida**.

`lib/storage/s3.ts` construye el cliente con:

```ts
requestChecksumCalculation: 'WHEN_REQUIRED'
```

Con eso el presign queda en `X-Amz-Content-Sha256=UNSIGNED-PAYLOAD` y
`X-Amz-SignedHeaders=content-length;host`, que es lo que el navegador
efectivamente manda.

Es el bug mas dificil de diagnosticar de toda la migracion. Si alguna vez los
uploads empiezan a tirar 400 despues de actualizar el SDK, mirar esto primero.

---

## 7. Validacion de las subidas

Antes el tamano y el tipo se chequeaban **solo en el cliente**, y la URL
prefirmada firmaba unicamente el header `host`: con una URL legitima se podian
subir 200 MB de cualquier cosa. Ahora los 4 endpoints de presign validan en el
server (`validateUpload` en `lib/storage/s3.ts`):

| Tipo | Maximo | Extensiones |
|---|---|---|
| Imagen de marketplace / logo de negocio / imagen de promocion | 5 MB | jpg, jpeg, png, webp |
| Comprobante de gasto | 15 MB | pdf, jpg, jpeg, png, webp, gif, heic, heif |
| Comprobante de pago | 15 MB | pdf, jpg, jpeg, png, webp, gif, heic, heif |

Cuando el cliente manda `sizeBytes`, el tamano se mete **dentro de la firma**
(`ContentLength`), asi que el `PUT` solo vale para un archivo de exactamente
esos bytes: no se puede reusar la URL para subir algo mas grande.

Por eso `content-length` tiene que estar en `AllowedHeaders` del CORS.

---

## 8. Checklist de puesta en marcha

1. Crear los dos buckets.
2. Bucket publico: lectura anonima + dominio propio. Bucket privado: cerrado.
3. CORS en los dos buckets con el origen real de la app.
4. Credenciales con permiso de lectura/escritura solo sobre esos dos buckets.
5. Completar las 7 variables `S3_*` en el `.env` del servidor.
6. Probar de punta a punta:
   - subir una imagen de promocion desde el panel de negocio y verificarla en el
     home (bucket publico, URL directa);
   - subir un comprobante de gasto desde iadmin y abrirlo (bucket privado, URL
     prefirmada);
   - pegarle a la URL de un objeto privado sin firmar: tiene que dar 403.
