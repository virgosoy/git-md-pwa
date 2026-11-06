import { describe, it, expect } from 'vitest'
import { extractHeadings } from './index'

// S1 · 标题抽取：H1-H6 全量；代码块围栏内不算；known-good 字面量

describe('extractHeadings', () => {
  it('抽取 H1-H6 及文本 trim', () => {
    const content = [
      '# 部署排障',
      '正文',
      '## 二级 ##',
      '### 三级',
      '###### 六级',
      '无标题行'
    ].join('\n')
    expect(extractHeadings(content)).toEqual([
      { level: 1, text: '部署排障' },
      { level: 2, text: '二级' },
      { level: 3, text: '三级' },
      { level: 6, text: '六级' }
    ])
  })

  it('代码块围栏内的 # 不算标题，围栏外的算', () => {
    const content = [
      '```js',
      '# 不是标题',
      'const x = 1',
      '```',
      '# 真标题'
    ].join('\n')
    expect(extractHeadings(content)).toEqual([{ level: 1, text: '真标题' }])
  })

  it('无标题返回空数组；无空格井号不算标题', () => {
    expect(extractHeadings('hello\nworld')).toEqual([])
    expect(extractHeadings('###not-heading')).toEqual([])
  })

  it('CommonMark 语义：无空格的尾部 # 保留（# foo# → foo#）', () => {
    expect(extractHeadings('# foo#')).toEqual([{ level: 1, text: 'foo#' }])
  })

  it('CRLF 与尾部 # 正常处理', () => {
    expect(extractHeadings('## 标题\r\n正文\r\n')).toEqual([{ level: 2, text: '标题' }])
  })
})
