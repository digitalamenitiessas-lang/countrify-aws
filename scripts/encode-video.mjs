import { spawnSync } from 'node:child_process'
import { existsSync, renameSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const input = path.join(root, 'public', 'edificios.mp4')
const output = path.join(root, 'public', 'edificios.scrub.mp4')

if (!existsSync(input)) {
  console.error(`No existe ${input}`)
  process.exit(1)
}

const args = [
  '-y',
  '-i', input,
  '-an',
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '22',
  '-g', '1',
  '-keyint_min', '1',
  '-sc_threshold', '0',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  output,
]

console.log('Re-encodeando con todos los frames como keyframes…')
const result = spawnSync(ffmpegPath, args, { stdio: 'inherit' })
if (result.status !== 0) {
  console.error('ffmpeg fallo')
  process.exit(result.status ?? 1)
}

const beforeSize = statSync(input).size
const afterSize = statSync(output).size
console.log(`\nOriginal: ${(beforeSize / 1024 / 1024).toFixed(2)} MB`)
console.log(`Re-encoded: ${(afterSize / 1024 / 1024).toFixed(2)} MB`)

renameSync(output, input)
console.log(`\nReemplazado ${path.relative(root, input)}`)
