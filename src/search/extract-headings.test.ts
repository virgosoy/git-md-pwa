import { describe, it, expect } from 'vitest'
import { extractHeadings, findBodySnippet } from './index'

// S1 · 标题抽取：H1-H6 全量；代码块围栏内不算；known-good 字面量
// S5 · token 流默认（票 15）：markdown-it 容器（引用/列表）内标题也能抽出；regex 模式保留旧行为

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
      { level: 1, text: '部署排障', nth: 1 },
      { level: 2, text: '二级', nth: 1 },
      { level: 3, text: '三级', nth: 1 },
      { level: 6, text: '六级', nth: 1 }
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
    expect(extractHeadings(content)).toEqual([{ level: 1, text: '真标题', nth: 1 }])
  })

  it('无标题返回空数组；无空格井号不算标题', () => {
    expect(extractHeadings('hello\nworld')).toEqual([])
    expect(extractHeadings('###not-heading')).toEqual([])
  })

  it('CommonMark 语义：无空格的尾部 # 保留（# foo# → foo#）', () => {
    expect(extractHeadings('# foo#')).toEqual([{ level: 1, text: 'foo#', nth: 1 }])
  })

  it('CRLF 与尾部 # 正常处理', () => {
    expect(extractHeadings('## 标题\r\n正文\r\n')).toEqual([{ level: 2, text: '标题', nth: 1 }])
  })

  // —— 票 15 ——

  it('token 流（默认）：引用块/列表内标题也抽出（HTML 语义=渲染器一致）', () => {
    const content = [
      '前文',
      '',
      '> #### 💛 grill-me (skill)',
      '',
      '- ## 列表内标题',
      '',
      '1. ### 有序列表标题'
    ].join('\n')
    expect(extractHeadings(content)).toEqual([
      { level: 4, text: '💛 grill-me (skill)', nth: 1 },
      { level: 2, text: '列表内标题', nth: 1 },
      { level: 3, text: '有序列表标题', nth: 1 }
    ])
  })

  it('regex 模式：保留旧行为，容器内标题不抽（回退开关语义）', () => {
    const content = ['> #### 💛 grill-me (skill)', '', '- ## 列表内标题'].join('\n')
    // 显式传 'regex' 走旧逐行正则
    expect(extractHeadings(content, 'regex')).toEqual([])
  })

  it('regex 回退：4反引号外层围栏不被内层3反引号行提前闭合，闭合后裸标题恢复（票16）', () => {
    const content = [
      '````md', // 外层 4 反引号开口
      '```', // 内层 3 反引号行：数量 < 外层，不能闭合外层围栏
      '正文', // 仍在外层围栏内
      '````', // 4 反引号闭合外层（旧代码误当新开口）
      '#### 💛 grill-me (skill)' // 闭合后是真标题（旧代码被吞）
    ].join('\n')
    expect(extractHeadings(content, 'regex')).toEqual([
      { level: 4, text: '💛 grill-me (skill)', nth: 1 }
    ])
  })

  it('regex 回退：4反引号外层围栏内嵌 3反引号+4反引号 双重内层，闭合匹配外层（票16 实链）', () => {
    const content = [
      '````md', // 外层 4 反引号开口
      '```js', // 内层 3 反引号开口
      'const x = 1',
      '```', // 内层 3 反引号闭合（不应闭合外层）
      '仍在外层',
      '````', // 外层 4 反引号闭合
      '#### karpathy-guidelines', // 真标题
      '正文'
    ].join('\n')
    expect(extractHeadings(content, 'regex')).toEqual([
      { level: 4, text: 'karpathy-guidelines', nth: 1 }
    ])
  })

  it('regex 回退：同样场景下 findBodySnippet 围栏跳桶一致（票16）', () => {
    // 4反引号外层正确闭合：其后的标题行不算正文 → 摘录为 null
    // 修复前：内层3反引号误闭合外层 → 4反引号成新开口 → 标题行被圈进错误围栏当代码可搜
    const content = [
      '````md',
      '```js',
      'x = 1',
      '```', // 若误闭合外层，此处开始错位
      '外层继续',
      '````', // 外层正确闭合（修复后）；新开口（修复前）
      '#### 目标标题' // 围栏外的标题行，不算正文
    ].join('\n')
    expect(findBodySnippet(content, '目标')).toBeNull()
  })

  it('围栏内标题 token 流也不抽（语义与正则一致）', () => {
    const content = ['```md', '# 不是标题', '```', '', '# 真标题'].join('\n')
    expect(extractHeadings(content)).toEqual([{ level: 1, text: '真标题', nth: 1 }])
  })

  // —— 票 21：标题文本与渲染后 textContent 对齐 ——

  it('行内标记剥成纯文本（链接/行内 HTML/图片 alt 不算标题文本）', () => {
    const content = [
      '## 见 [文档](https://x.com/a) 说明',
      '## <b>粗体</b>标题',
      '## ![图](a.png) 说明'
    ].join('\n')
    expect(extractHeadings(content)).toEqual([
      { level: 2, text: '见 文档 说明', nth: 1 },
      { level: 2, text: '粗体标题', nth: 1 },
      { level: 2, text: '说明', nth: 1 }
    ])
  })

  it('同 level+text 重复出现按顺序记 nth（1 起）', () => {
    const content = ['# 甲', '## 甲', '### 甲', '## 甲'].join('\n')
    expect(extractHeadings(content)).toEqual([
      { level: 1, text: '甲', nth: 1 },
      { level: 2, text: '甲', nth: 1 },
      { level: 3, text: '甲', nth: 1 },
      { level: 2, text: '甲', nth: 2 }
    ])
  })
})
