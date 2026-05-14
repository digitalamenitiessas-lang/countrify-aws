import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'public', 'countrify-logo.svg')

async function build(target, size, padRatio = 0.06) {
  const trimmed = await sharp(source).trim().toBuffer()
  const inner = Math.round(size * (1 - padRatio * 2))
  const resized = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toFile(target)
  console.log(`OK ${path.relative(root, target)} (${size}x${size})`)
}

await build(path.join(root, 'app', 'icon.png'), 64, 0.04)
await build(path.join(root, 'app', 'apple-icon.png'), 180, 0.08)
