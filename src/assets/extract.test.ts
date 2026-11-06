import { describe, it, expect } from 'vitest'
import { collectAssetRefs } from './extract'

// S1 · 资源引用提取：相对图片/PDF 归一路径；data/http/md/锚点排除

function makeRoot(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

const NOTE = `
<img src="./img/logo.png" />
<img src="../shared/cover.jpg" />
<img src="data:image/png;base64,AA==" />
<img src="https://example.com/x.png" />
<a href="files/manual.pdf">PDF</a>
<a href="other.md">笔记</a>
<a href="#toc">锚点</a>
<a href="https://a.com">外链</a>
`

describe('collectAssetRefs', () => {
  it('只收集相对资源，归一化到仓库路径并区分类型', () => {
    const refs = collectAssetRefs(makeRoot(NOTE), 'docs/sub/note.md')
    const plain = refs.map((r) => ({ path: r.path, kind: r.kind }))
    expect(plain).toEqual([
      { path: 'docs/sub/img/logo.png', kind: 'image' },
      { path: 'docs/shared/cover.jpg', kind: 'image' },
      { path: 'docs/sub/files/manual.pdf', kind: 'link' }
    ])
  })

  it('无资源返回空数组', () => {
    expect(collectAssetRefs(makeRoot('<p>纯文字 <a href="https://x">外链</a></p>'), 'a.md')).toEqual([])
  })
})
