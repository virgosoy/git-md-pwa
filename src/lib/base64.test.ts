import { describe, it, expect } from 'vitest'
import {
  base64ToBytes,
  bytesToBase64,
  decodeUtf8Base64,
  encodeUtf8Base64
} from './base64'

// 断言用已知字面量（独立来源：UTF-8 字节表 + base64 标准）。

describe('UTF-8 ↔ base64', () => {
  it('ASCII 往返；空串', () => {
    expect(encodeUtf8Base64('hi')).toBe('aGk=')
    expect(decodeUtf8Base64('aGk=')).toBe('hi')
    expect(encodeUtf8Base64('')).toBe('')
    expect(decodeUtf8Base64('')).toBe('')
  })

  it('中文、emoji 不用 Latin-1 近似', () => {
    expect(encodeUtf8Base64('中文')).toBe('5Lit5paH')
    expect(decodeUtf8Base64('5Lit5paH')).toBe('中文')
    expect(encodeUtf8Base64('😀')).toBe('8J+YgA==')
    expect(decodeUtf8Base64('8J+YgA==')).toBe('😀')
  })

  it('换行与 GitHub 风格的折行 base64 保持一致', () => {
    expect(encodeUtf8Base64('a\nb\r\nc')).toBe('YQpiDQpj')
    expect(decodeUtf8Base64('YQpi\r\nDQpj')).toBe('a\nb\r\nc')
  })

  it('1 MB 文本往返（覆盖分块拼接）', () => {
    const text = 'a'.repeat(1024 * 1024)
    expect(decodeUtf8Base64(encodeUtf8Base64(text))).toBe(text)
  })

  it('字节数组往返（资源/二进制路径共用）', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255])
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual([
      0, 1, 127, 128, 255
    ])
  })
})
