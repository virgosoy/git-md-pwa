// UTF-8 ↔ base64：GitHub Contents API 的 content 字段要求 base64。
// 浏览器 btoa/atob 只处理 Latin-1 字符串，中文/emoji 必须先经 TextEncoder/TextDecoder。
// 大文件按块拼接，避免 String.fromCharCode(...bytes) 的参数数量上限。

const CHUNK = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  // GitHub 返回的 base64 带换行；atob 不接受空白
  const binary = atob(base64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function encodeUtf8Base64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text))
}

export function decodeUtf8Base64(base64: string): string {
  return new TextDecoder().decode(base64ToBytes(base64))
}
