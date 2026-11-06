import { describe, it, expect } from 'vitest'
import { wireAssets, PLACEHOLDER_IMG, type AssetLoader } from './wire'

// S4 · 资源装配：图片先占位、load 成功回填；链接命中换 dataURL、失败保持原样

const HTML = `
<img src="./img/a.png" />
<img src="./img/b.png" />
<a href="./files/manual.pdf">PDF</a>
`

function makeRoot(): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = HTML
  return el
}

describe('wireAssets（notePath=notes/x.md）', () => {
  it('图片先占位、load 放行后回填；PDF 未放行保持原样', async () => {
    const root = makeRoot()
    const resolvers = new Map<string, (v: string | null) => void>()
    const loader: AssetLoader = {
      load: (p) => new Promise((r) => resolvers.set(p, r))
    }
    const count = await wireAssets(root, 'notes/x.md', loader)

    const imgs = [...root.querySelectorAll('img')]
    expect(count).toBe(3)
    // 两张图都先落下占位
    expect(imgs[0].getAttribute('src')).toBe(PLACEHOLDER_IMG)
    expect(imgs[1].getAttribute('src')).toBe(PLACEHOLDER_IMG)
    // 逐条放行 → 回填
    resolvers.get('notes/img/a.png')!('data:image/png;base64,AAA=')
    resolvers.get('notes/img/b.png')!('data:image/png;base64,BBB=')
    await new Promise((r) => setTimeout(r, 0))
    expect(imgs[0].getAttribute('src')).toBe('data:image/png;base64,AAA=')
    expect(imgs[1].getAttribute('src')).toBe('data:image/png;base64,BBB=')

    // PDF 链接的 load 未放行 → href 保持原样
    const a = root.querySelector('a')!
    expect(a.getAttribute('href')).toBe('./files/manual.pdf')
  })

  it('链接资源 load 成功 → href 换成 dataURL；返回 null → 标「未镜像」', async () => {
    // 命中
    const root1 = makeRoot()
    await wireAssets(root1, 'notes/x.md', {
      load: async () => 'data:application/pdf;base64,PDF='
    })
    expect(root1.querySelector('a')!.getAttribute('href')).toBe(
      'data:application/pdf;base64,PDF='
    )

    // 未命中：href 不变 + 加 is-missing 标记
    const root2 = makeRoot()
    await wireAssets(root2, 'notes/x.md', { load: async () => null })
    const a = root2.querySelector('a')!
    expect(a.getAttribute('href')).toBe('./files/manual.pdf')
    expect(a.classList.contains('is-missing')).toBe(true)
  })
})
