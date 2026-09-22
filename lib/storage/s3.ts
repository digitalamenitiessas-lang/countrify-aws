import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Almacenamiento de objetos S3-compatible. El mismo cliente sirve para
// Cloudflare R2 y para MinIO: cambia solo el endpoint y las credenciales.
//
// R2:    S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com  S3_REGION=auto
// MinIO: S3_ENDPOINT=https://archivos.tudominio.com                 S3_REGION=us-east-1
//
// OJO MinIO: el endpoint tiene que ser el hostname PUBLICO con el que va a
// pegar el navegador. Si aca ponemos http://minio:9000 (nombre interno del
// contenedor) la firma se calcula sobre ese host y el PUT desde el browser a
// https://archivos.tudominio.com da 403 SignatureDoesNotMatch. Ver docs/STORAGE.md.
const S3_ENDPOINT = process.env.S3_ENDPOINT
const S3_REGION = process.env.S3_REGION ?? 'auto'
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY
// Dos buckets, no uno. En R2 y en MinIO el acceso publico se configura por
// bucket, no por prefijo: si los comprobantes de gastos y de pago vivieran en
// el mismo bucket que el marketplace, cualquiera que adivine la key se baja la
// contabilidad del consorcio.
const S3_PUBLIC_BUCKET = process.env.S3_PUBLIC_BUCKET
const S3_PRIVATE_BUCKET = process.env.S3_PRIVATE_BUCKET
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} no esta configurada.`)
  }

  return value
}

let cachedClient: S3Client | null = null

export function getS3Client() {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: S3_REGION,
      endpoint: requireEnv('S3_ENDPOINT', S3_ENDPOINT),
      credentials: {
        accessKeyId: requireEnv('S3_ACCESS_KEY_ID', S3_ACCESS_KEY_ID),
        secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY', S3_SECRET_ACCESS_KEY),
      },
      // R2 y MinIO no resuelven bucket.endpoint como subdominio: hay que pedir
      // las keys por path (endpoint/bucket/key).
      forcePathStyle: true,
      // CRITICO — no sacar. Desde @aws-sdk/client-s3 3.1045 el SDK manda
      // flexible checksums (CRC32) por defecto en todos los PUT. Contra R2 y
      // MinIO eso rompe el PUT prefirmado: el SDK agrega x-amz-checksum-crc32 /
      // x-amz-sdk-checksum-algorithm a la firma, el navegador no manda esos
      // headers y el server devuelve 400 SignatureDoesNotMatch. El sintoma es
      // confuso (el presign funciona, el PUT falla siempre) y cuesta muchisimo
      // de diagnosticar. WHEN_REQUIRED deja el sha256 en UNSIGNED-PAYLOAD y
      // solo firma host (+ content-length cuando lo pedimos nosotros).
      requestChecksumCalculation: 'WHEN_REQUIRED',
    })
  }

  return cachedClient
}

export function getPublicBucket() {
  return requireEnv('S3_PUBLIC_BUCKET', S3_PUBLIC_BUCKET)
}

export function getPrivateBucket() {
  return requireEnv('S3_PRIVATE_BUCKET', S3_PRIVATE_BUCKET)
}

// ─── VALIDACION DE SUBIDAS ──────────────────────────────────────────────────
//
// Antes el tamano y el tipo se chequeaban solo en el cliente, y la URL
// prefirmada firmaba unicamente el header 'host': con una URL legitima se
// podian subir 200 MB de cualquier cosa. Ahora el server valida extension y
// content-type contra una allowlist, y mete el tamano dentro de la firma
// (ContentLength => X-Amz-SignedHeaders=content-length;host), asi el PUT solo
// vale para un archivo de exactamente esos bytes.

export type StorageUploadKind =
  | 'marketplace-image'
  | 'business-logo'
  | 'promotion-image'
  | 'expense-document'
  | 'payment-claim'

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const
const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const

// Comprobantes: el input del cliente acepta "application/pdf,image/*", asi que
// ademas del pdf dejamos pasar los formatos que tira una camara de celular.
const DOCUMENT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'] as const
const DOCUMENT_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const

const MB = 1024 * 1024

export const UPLOAD_RULES: Record<
  StorageUploadKind,
  { maxBytes: number; maxMb: number; extensions: readonly string[]; contentTypes: readonly string[] }
> = {
  // 5 MB: mismo limite que IMAGE_RULES en lib/constants.ts.
  'marketplace-image': { maxBytes: 5 * MB, maxMb: 5, extensions: IMAGE_EXTENSIONS, contentTypes: IMAGE_CONTENT_TYPES },
  'business-logo': { maxBytes: 5 * MB, maxMb: 5, extensions: IMAGE_EXTENSIONS, contentTypes: IMAGE_CONTENT_TYPES },
  'promotion-image': { maxBytes: 5 * MB, maxMb: 5, extensions: IMAGE_EXTENSIONS, contentTypes: IMAGE_CONTENT_TYPES },
  // 15 MB: mismo limite que MAX_MB en expense-document-uploader.tsx.
  'expense-document': {
    maxBytes: 15 * MB,
    maxMb: 15,
    extensions: DOCUMENT_EXTENSIONS,
    contentTypes: DOCUMENT_CONTENT_TYPES,
  },
  // El formulario de reportar pago no tenia tope propio; usamos el mismo que
  // el otro comprobante para no dejarlo abierto.
  'payment-claim': {
    maxBytes: 15 * MB,
    maxMb: 15,
    extensions: DOCUMENT_EXTENSIONS,
    contentTypes: DOCUMENT_CONTENT_TYPES,
  },
}

/** Extension en minusculas, o cadena vacia si el nombre no tiene punto. */
function extensionOf(fileName: string) {
  const trimmed = fileName.trim()
  const dot = trimmed.lastIndexOf('.')
  if (dot <= 0 || dot === trimmed.length - 1) {
    return ''
  }

  const ext = trimmed.slice(dot + 1).toLowerCase()
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : ''
}

/** El content-type puede venir con parametros: "image/jpeg; charset=binary". */
function normalizeContentType(contentType: string | null | undefined) {
  return (contentType ?? '').split(';')[0].trim().toLowerCase()
}

export type UploadValidationError = { error: string; status: 400 | 413 }

/**
 * Valida extension, content-type y tamano de una subida contra las reglas del
 * tipo. Devuelve null si esta todo bien.
 */
export function validateUpload(
  kind: StorageUploadKind,
  params: { fileName: string; contentType?: string | null; sizeBytes?: number | null },
): UploadValidationError | null {
  const rules = UPLOAD_RULES[kind]

  const ext = extensionOf(params.fileName)
  if (!ext || !rules.extensions.includes(ext)) {
    return {
      error: `Formato de archivo no permitido. Se aceptan: ${rules.extensions.join(', ')}.`,
      status: 400,
    }
  }

  const contentType = normalizeContentType(params.contentType)
  // 'application/octet-stream' es el default que manda el cliente cuando el
  // navegador no sabe el tipo; lo dejamos pasar porque la extension ya valido.
  if (contentType && contentType !== 'application/octet-stream' && !rules.contentTypes.includes(contentType)) {
    return { error: 'Tipo de archivo no permitido.', status: 400 }
  }

  // sizeBytes es OBLIGATORIO. Si fuera opcional, un cliente que simplemente no
  // lo manda se saltea el tope de tamano entero y la validacion queda de
  // adorno: exactamente lo que pasaba antes, porque ninguno de los 4
  // componentes lo enviaba. Los 4 lo mandan ahora (file.size).
  //
  // Ojo con el alcance: esto frena al cliente honesto y al que manda un tamano
  // que no coincide lo frena S3/R2 al comparar con la firma, pero el valor
  // declarado no esta firmado por si solo. El tope real del lado del servidor
  // lo pone el proxy (request_body max_size en el Caddyfile).
  const sizeBytes = params.sizeBytes
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { error: 'No se pudo determinar el tamano del archivo.', status: 400 }
  }
  if (sizeBytes > rules.maxBytes) {
    return { error: `El archivo supera ${rules.maxMb}MB.`, status: 413 }
  }

  return null
}

function assertUploadAllowed(
  kind: StorageUploadKind,
  params: { fileName: string; contentType?: string | null; sizeBytes?: number | null },
) {
  const invalid = validateUpload(kind, params)
  if (invalid) {
    throw new Error(invalid.error)
  }
}

// ─── KEYS ───────────────────────────────────────────────────────────────────
//
// Las keys siguen arrancando con 'public/' y 'private/'. Ya no son lo que
// decide el acceso (eso lo decide el bucket) pero se conservan porque quedan
// guardadas en la base y el codigo de lectura las usa como marca para saber si
// una ruta se puede servir directo (path.startsWith('public/')).

function sanitizeFileNamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function splitFileName(fileName: string, fallbackBase: string, fallbackExt: string) {
  const originalName = fileName.trim() || `${fallbackBase}.${fallbackExt}`
  const ext = extensionOf(originalName) || fallbackExt
  // Sin punto no hay que cortar nada: lastIndexOf devuelve -1 y slice(0, -1) se
  // comia el ultimo caracter del nombre ("sinpunto" quedaba "sinpunt").
  const dot = originalName.lastIndexOf('.')
  const baseName = dot > 0 ? originalName.slice(0, dot) : originalName
  const safeName = sanitizeFileNamePart(baseName) || fallbackBase

  return {
    ext,
    safeName,
  }
}

export function buildMarketplaceObjectKey(profileId: string, itemId: string, fileName: string) {
  const { ext, safeName } = splitFileName(fileName, 'image', 'jpg')

  return `public/marketplace/${profileId}/${itemId}-${Date.now()}-${safeName}.${ext}`
}

function buildBusinessLogoObjectKey(businessId: string, fileName: string) {
  const { ext } = splitFileName(fileName, 'logo', 'jpg')
  return `public/businesses/${businessId}/logo-${Date.now()}.${ext}`
}

function buildPromotionObjectKey(businessId: string, promotionId: string, fileName: string) {
  const { ext, safeName } = splitFileName(fileName, 'promotion', 'jpg')

  return `public/promotions/${businessId}/${promotionId}-${Date.now()}-${safeName}.${ext}`
}

export function buildExpenseDocumentObjectKey(administrationId: string, expenseId: string, fileName: string) {
  const { ext, safeName } = splitFileName(fileName, 'document', 'bin')

  return `private/expenses/${administrationId}/${expenseId}/${Date.now()}-${safeName}.${ext}`
}

export function buildPaymentClaimObjectKey(
  administrationId: string,
  unitId: string,
  fileName: string,
) {
  const { ext, safeName } = splitFileName(fileName, 'comprobante', 'bin')
  return `private/payment-claims/${administrationId}/${unitId}/${Date.now()}-${safeName}.${ext}`
}

/**
 * URL publica de una key del bucket publico. En R2 es el dominio propio
 * conectado al bucket; en MinIO, el proxy que expone el bucket publico.
 */
export function buildPublicS3Url(objectKey: string) {
  const baseUrl = requireEnv('S3_PUBLIC_BASE_URL', S3_PUBLIC_BASE_URL).replace(/\/+$/, '')
  return `${baseUrl}/${objectKey}`
}

/** Igual que buildPublicS3Url pero sin tirar error si falta la config. */
export function buildPublicS3UrlOrNull(objectKey: string | null | undefined) {
  if (!objectKey || !S3_PUBLIC_BASE_URL) {
    return null
  }

  return `${S3_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${objectKey}`
}

// ─── SUBIDAS PREFIRMADAS ────────────────────────────────────────────────────

const UPLOAD_URL_TTL_SECONDS = 300

async function createPresignedPut(params: {
  bucket: string
  objectKey: string
  contentType: string
  sizeBytes?: number | null
}) {
  const command = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.objectKey,
    ContentType: params.contentType || 'application/octet-stream',
    // Cuando sabemos el tamano lo metemos en la firma: el SDK pasa a firmar
    // 'content-length;host' y el PUT solo vale si el navegador manda
    // exactamente esos bytes. Sin esto la URL sirve para subir lo que sea.
    ...(params.sizeBytes != null ? { ContentLength: params.sizeBytes } : {}),
  })

  return getSignedUrl(getS3Client(), command, { expiresIn: UPLOAD_URL_TTL_SECONDS })
}

export async function createMarketplaceUploadUrl(params: {
  profileId: string
  itemId: string
  fileName: string
  contentType: string
  sizeBytes?: number | null
}) {
  assertUploadAllowed('marketplace-image', params)

  const objectKey = buildMarketplaceObjectKey(params.profileId, params.itemId, params.fileName)
  const uploadUrl = await createPresignedPut({
    bucket: getPublicBucket(),
    objectKey,
    contentType: params.contentType,
    sizeBytes: params.sizeBytes,
  })

  return {
    objectKey,
    uploadUrl,
    publicUrl: buildPublicS3Url(objectKey),
  }
}

export async function createBusinessAssetUploadUrl(params: {
  kind: 'business-logo' | 'promotion-image'
  businessId: string
  recordId: string
  fileName: string
  contentType: string
  sizeBytes?: number | null
}) {
  assertUploadAllowed(params.kind, params)

  const objectKey =
    params.kind === 'business-logo'
      ? buildBusinessLogoObjectKey(params.businessId, params.fileName)
      : buildPromotionObjectKey(params.businessId, params.recordId, params.fileName)

  const uploadUrl = await createPresignedPut({
    bucket: getPublicBucket(),
    objectKey,
    contentType: params.contentType,
    sizeBytes: params.sizeBytes,
  })

  return {
    objectKey,
    uploadUrl,
    publicUrl: buildPublicS3Url(objectKey),
  }
}

export async function createPaymentClaimUploadUrl(params: {
  administrationId: string
  unitId: string
  fileName: string
  contentType: string
  sizeBytes?: number | null
}) {
  assertUploadAllowed('payment-claim', params)

  const objectKey = buildPaymentClaimObjectKey(params.administrationId, params.unitId, params.fileName)
  const uploadUrl = await createPresignedPut({
    bucket: getPrivateBucket(),
    objectKey,
    contentType: params.contentType,
    sizeBytes: params.sizeBytes,
  })

  return { objectKey, uploadUrl }
}

export async function createExpenseDocumentUploadUrl(params: {
  administrationId: string
  expenseId: string
  fileName: string
  contentType: string
  sizeBytes?: number | null
}) {
  assertUploadAllowed('expense-document', params)

  const objectKey = buildExpenseDocumentObjectKey(params.administrationId, params.expenseId, params.fileName)
  const uploadUrl = await createPresignedPut({
    bucket: getPrivateBucket(),
    objectKey,
    contentType: params.contentType,
    sizeBytes: params.sizeBytes,
  })

  return {
    objectKey,
    uploadUrl,
  }
}

// ─── LECTURA / ESCRITURA PRIVADA ────────────────────────────────────────────

const DOWNLOAD_URL_TTL_SECONDS = 300

/**
 * Los objetos privados nunca se sirven directo: siempre por URL prefirmada de
 * corta duracion, generada despues de chequear permisos.
 */
export async function createPrivateS3DownloadUrl(objectKey: string, fileName?: string | null) {
  const command = new GetObjectCommand({
    Bucket: getPrivateBucket(),
    Key: objectKey,
    ResponseContentDisposition: fileName
      ? `inline; filename="${encodeURIComponent(fileName)}"`
      : 'inline',
  })

  return getSignedUrl(getS3Client(), command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS })
}

/** Sube un buffer al bucket privado (comprobantes cargados server-side). */
export async function uploadPrivateBuffer(params: {
  objectKey: string
  body: Buffer
  contentType: string
}) {
  const command = new PutObjectCommand({
    Bucket: getPrivateBucket(),
    Key: params.objectKey,
    Body: params.body,
    ContentType: params.contentType || 'application/octet-stream',
  })

  await getS3Client().send(command)
}

/** Borra un objeto del bucket privado. */
export async function deletePrivateObject(objectKey: string) {
  const command = new DeleteObjectCommand({
    Bucket: getPrivateBucket(),
    Key: objectKey,
  })

  await getS3Client().send(command)
}
