import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const input = path.join(root, 'public', 'edificios.mp4')
const output = path.join(root, 'public', 'edificios-mobile.mp4')

if (!existsSync(input)) {
  console.error(`No existe ${input}`)
  process.exit(1)
}

const args = [
  '-y',
  '-i', input,
  '-an',
  '-vf', 'scale=-2:540',
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '20',
  '-g', '1',
  '-keyint_min', '1',
  '-sc_threshold', '0',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  output,
]

console.log('Generando version mobile (540p, all-intra)…')
const result = spawnSync(ffmpegPath, args, { stdio: 'inherit' })
if (result.status !== 0) {
  console.error('ffmpeg fallo')
  process.exit(result.status ?? 1)
}

console.log(`\nMobile: ${(statSync(output).size / 1024 / 1024).toFixed(2)} MB`)
console.log(`Desktop: ${(statSync(input).size / 1024 / 1024).toFixed(2)} MB`)
