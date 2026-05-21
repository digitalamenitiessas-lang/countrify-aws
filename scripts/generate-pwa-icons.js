const path = require('path')
const sharp = require('sharp')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'public', 'app-icon.png')
const publicDir = path.join(root, 'public')

const targets = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'apple-icon.png', size: 192 },
  { file: 'icon-192x192.png', size: 192 },
  { file: 'icon-512x512.png', size: 512 },
  { file: 'icon-maskable-512x512.png', size: 512 },
]

async function main() {
  for (const { file, size } of targets) {
    const out = path.join(publicDir, file)
    await sharp(source).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(out)
    console.log(`✓ ${file} (${size}x${size})`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
