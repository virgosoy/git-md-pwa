import { describe, it, expect } from 'vitest'
import { applyEol, detectEol, stripBom, toLf } from './eol'

describe('行尾检测与还原', () => {
  it('统一 LF / 统一 CRLF / 无换行', () => {
    expect(detectEol('a\nb\n')).toBe('lf')
    expect(detectEol('a\r\nb\r\n')).toBe('crlf')
    expect(detectEol('a')).toBe('lf')
    expect(detectEol('')).toBe('lf')
  })

  it('混合行尾统一按 LF；裸 CR 也按 LF', () => {
    expect(detectEol('a\r\nb\nc')).toBe('lf')
    expect(detectEol('a\rb')).toBe('lf')
  })

  it('applyEol：LF 文本按原风格还原；CRLF 输入先归一再还原', () => {
    expect(applyEol('a\nb', 'lf')).toBe('a\nb')
    expect(applyEol('a\nb', 'crlf')).toBe('a\r\nb')
    expect(applyEol('a\r\nb', 'lf')).toBe('a\nb')
    expect(applyEol('a\r\nb', 'crlf')).toBe('a\r\nb')
  })

  it('toLf 收敛 CRLF 与裸 CR', () => {
    expect(toLf('a\r\nb\rc\nd')).toBe('a\nb\nc\nd')
  })

  it('stripBom 只去开头 BOM', () => {
    expect(stripBom('﻿# hi')).toBe('# hi')
    expect(stripBom('a﻿b')).toBe('a﻿b')
    expect(stripBom('')).toBe('')
  })
})
