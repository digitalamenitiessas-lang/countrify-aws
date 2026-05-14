import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const AWS_REGION = process.env.AWS_REGION
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET
const AWS_S3_PUBLIC_BASE_URL = process.env.AWS_S3_PUBLIC_BASE_URL

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} no esta configurada.`)
  }

  return value
}

export function getS3Client() {
  return new S3Client({
    region: requireEnv('AWS_REGION', AWS_REGION),
  })
}

export function getS3Bucket() {
  return requireEnv('AWS_S3_BUCKET', AWS_S3_BUCKET)
}

function sanitizeFileNamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function splitFileName(fileName: string, fallbackBase: string, fallbackExt: string) {
  const originalName = fileName.trim() || `${fallbackBase}.${fallbackExt}`
  const ext = originalName.split('.').pop()?.toLowerCase() ?? fallbackExt
  const baseName = originalName.slice(0, originalName.lastIndexOf('.')) || originalName
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

export function buildPublicS3Url(objectKey: string) {
  const baseUrl = requireEnv('AWS_S3_PUBLIC_BASE_URL', AWS_S3_PUBLIC_BASE_URL).replace(/\/+$/, '')
  return `${baseUrl}/${objectKey}`
}

export async function createMarketplaceUploadUrl(params: {
  profileId: string
  itemId: string
  fileName: string
  contentType: string
}) {
  const objectKey = buildMarketplaceObjectKey(params.profileId, params.itemId, params.fileName)
  const command = new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: objectKey,
    ContentType: params.contentType || 'application/octet-stream',
  })

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 300 })

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
}) {
  const objectKey =
    params.kind === 'business-logo'
      ? buildBusinessLogoObjectKey(params.businessId, params.fileName)
      : buildPromotionObjectKey(params.businessId, params.recordId, params.fileName)

  const command = new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: objectKey,
    ContentType: params.contentType || 'application/octet-stream',
  })

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 300 })

  return {
    objectKey,
    uploadUrl,
    publicUrl: buildPublicS3Url(objectKey),
  }
}

export async function createExpenseDocumentUploadUrl(params: {
  administrationId: string
  expenseId: string
  fileName: string
  contentType: string
}) {
  const objectKey = buildExpenseDocumentObjectKey(params.administrationId, params.expenseId, params.fileName)
  const command = new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: objectKey,
    ContentType: params.contentType || 'application/octet-stream',
  })

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 300 })

  return {
    objectKey,
    uploadUrl,
  }
}

export async function createPrivateS3DownloadUrl(objectKey: string, fileName?: string | null) {
  const command = new GetObjectCommand({
    Bucket: getS3Bucket(),
    Key: objectKey,
    ResponseContentDisposition: fileName
      ? `inline; filename="${encodeURIComponent(fileName)}"`
      : 'inline',
  })

  return getSignedUrl(getS3Client(), command, { expiresIn: 300 })
}

export async function uploadBufferToS3(params: {
  objectKey: string
  body: Buffer
  contentType: string
}) {
  const command = new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: params.objectKey,
    Body: params.body,
    ContentType: params.contentType || 'application/octet-stream',
  })

  await getS3Client().send(command)
}

export async function deleteObjectFromS3(objectKey: string) {
  const command = new DeleteObjectCommand({
    Bucket: getS3Bucket(),
    Key: objectKey,
  })

  await getS3Client().send(command)
}
