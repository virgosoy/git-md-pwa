// S3 · 资源管线：确保某资源可离线显示（dataURL）。
// 缓存命中零网络；未缓存则拉字节、超 10MB 标占位不入缓存、否则编码入缓存。

import type { GithubClient, Repository } from '../github/client'
import { loadAsset, saveAsset } from './store'

/** 单资源缓存上限（>10MB 跳过并标占位） */
export const MAX_ASSET_BYTES = 10 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf'
}

export function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return `data:${mime};base64,${btoa(bin)}`
}

/**
 * 确保资源可用：返回 dataURL（可直接赋给 img/a），网络不可得/超限时为 null。
 */
export async function ensureAsset(
  client: GithubClient,
  repo: Repository,
  path: string
): Promise<string | null> {
  const existing = await loadAsset(path)
  if (existing) {
    return existing.status === 'ok' && existing.dataUrl ? existing.dataUrl : null
  }
  const bytes = await client.getRawBytes(repo, path)
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    await saveAsset({ path, size: bytes.byteLength, status: 'too-large', savedAt: Date.now() })
    return null
  }
  const dataUrl = bytesToDataUrl(bytes, mimeFromPath(path))
  await saveAsset({ path, dataUrl, size: bytes.byteLength, status: 'ok', savedAt: Date.now() })
  return dataUrl
}
