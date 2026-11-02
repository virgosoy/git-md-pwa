import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 用 Node 内置能力生成纯色占位图标（后续可换成正式图标，无需任何依赖）
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public')

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function png(size, bg, fg) {
  const raw = Buffer.alloc(size * (1 + size * 4))
  const pageTop = Math.round(size * 0.22)
  const pageLeft = Math.round(size * 0.3)
  const pageW = Math.round(size * 0.4)
  const pageH = Math.round(size * 0.5)
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4)
    raw[row] = 0 // filter: none
    const inPage = y >= pageTop && y < pageTop + pageH
    for (let x = 0; x < size; x++) {
      const inRect = inPage && x >= pageLeft && x < pageLeft + pageW
      const rgb = inRect ? fg : bg
      const o = row + 1 + x * 4
      raw[o] = rgb[0]
      raw[o + 1] = rgb[1]
      raw[o + 2] = rgb[2]
      raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const bg = [24, 24, 27]
const fg = [63, 131, 248]

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'icon-512.png'), png(512, bg, fg))
writeFileSync(join(outDir, 'icon-192.png'), png(192, bg, fg))
writeFileSync(join(outDir, 'apple-touch-icon.png'), png(180, bg, fg))
console.log(`icons written to ${outDir}`)
