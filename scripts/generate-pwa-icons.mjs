#!/usr/bin/env node
/**
 * Renders the PWA icon set into public/icons from one inline SVG (a 3x3 grid, the
 * ShiftGrid mark, on slate). Re-run after changing the artwork:
 *
 *   node scripts/generate-pwa-icons.mjs
 *
 * `maskable` icons keep the artwork inside the central 80% safe zone, as Android
 * crops them to a circle/squircle.
 */
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const SLATE = '#1e293b'
const EMERALD = '#50C878'

/** @param {number} scale share of the canvas the 3x3 grid occupies */
const svg = (scale) => {
  const size = 512
  const grid = size * scale
  const gap = grid * 0.07
  const cell = (grid - gap * 2) / 3
  const x0 = (size - grid) / 2
  let cells = ''
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      // The middle cell is lit: the "booked" slot.
      const fill = r === 1 && c === 1 ? '#ffffff' : EMERALD
      cells += `<rect x="${x0 + c * (cell + gap)}" y="${x0 + r * (cell + gap)}" width="${cell}" height="${cell}" rx="${cell * 0.18}" fill="${fill}"/>`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${SLATE}"/>${cells}</svg>`
}

const out = 'public/icons'
mkdirSync(out, { recursive: true })

const jobs = [
  ['icon-192.png', 192, 0.56],
  ['icon-512.png', 512, 0.56],
  ['icon-maskable-512.png', 512, 0.46],
  ['apple-touch-icon.png', 180, 0.56],
]
for (const [name, px, scale] of jobs) {
  await sharp(Buffer.from(svg(scale))).resize(px, px).png().toFile(`${out}/${name}`)
  console.log('wrote', `${out}/${name}`)
}
