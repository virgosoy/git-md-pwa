import { describe, it, expect } from 'vitest'
import { wireAssets, PLACEHOLDER_IMG, NOT_LOADED_IMG, type AssetLoader } from './wire'

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

describe('wireAssets 关闭自动下载（autoDownload: false）', () => {
  const PATHS = ['notes/img/a.png', 'notes/img/b.png', 'notes/files/manual.pdf']

  function cachedLoader(hits: Record<string, string>): AssetLoader & {
    loads: string[]
    cachedCalls: string[]
  } {
    const loads: string[] = []
    const cachedCalls: string[] = []
    return {
      loads,
      cachedCalls,
      async load(p) {
        loads.push(p)
        return 'data:net'
      },
      async cached(p) {
        cachedCalls.push(p)
        return hits[p] ?? null
      }
    }
  }

  it('已缓存直接回填、零网络；未缓存图片留「未下载」、链接标「（未下载）」', async () => {
    const root = makeRoot()
    const loader = cachedLoader({ 'notes/img/a.png': 'data:image/png;base64,AAA=' })
    const count = await wireAssets(root, 'notes/x.md', loader, { autoDownload: false })

    expect(count).toBe(3)
    // 一条网络请求都没有，只读缓存
    expect(loader.loads).toEqual([])
    expect([...loader.cachedCalls].sort()).toEqual([...PATHS].sort())

    const imgs = [...root.querySelectorAll('img')]
    expect(imgs[0].getAttribute('src')).toBe('data:image/png;base64,AAA=')
    expect(imgs[1].getAttribute('src')).toBe(NOT_LOADED_IMG)

    const a = root.querySelector('a')!
    expect(a.getAttribute('href')).toBe('./files/manual.pdf')
    expect(a.classList.contains('is-not-downloaded')).toBe(true)
    expect(a.classList.contains('is-missing')).toBe(false)
  })

  it('已缓存链接 → href 变 dataURL 且不带「未下载」标记', async () => {
    const root = makeRoot()
    const loader = cachedLoader({ 'notes/files/manual.pdf': 'data:application/pdf;base64,PDF=' })
    await wireAssets(root, 'notes/x.md', loader, { autoDownload: false })

    const a = root.querySelector('a')!
    expect(a.getAttribute('href')).toBe('data:application/pdf;base64,PDF=')
    expect(a.classList.contains('is-not-downloaded')).toBe(false)
  })

  it('点未下载图片：只请求该路径并回填', async () => {
    const root = makeRoot()
    const loads: string[] = []
    const loader: AssetLoader = {
      async load(p) {
        loads.push(p)
        return 'data:image/png;base64,BBB='
      },
      async cached() {
        return null
      }
    }
    await wireAssets(root, 'notes/x.md', loader, { autoDownload: false })

    const img = root.querySelector('img')!
    expect(img.getAttribute('src')).toBe(NOT_LOADED_IMG)
    img.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 0))

    expect(loads).toEqual(['notes/img/a.png'])
    expect(img.getAttribute('src')).toBe('data:image/png;base64,BBB=')

    // 成功回填后监听已摘除：再点不会重复请求
    img.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 0))
    expect(loads).toEqual(['notes/img/a.png'])
  })

  it('点未下载链接：阻止跳出 App，下载后 href 变 dataURL', async () => {
    const root = makeRoot()
    const loader: AssetLoader = {
      async load() {
        return 'data:application/pdf;base64,PDF='
      },
      async cached() {
        return null
      }
    }
    await wireAssets(root, 'notes/x.md', loader, { autoDownload: false })

    const a = root.querySelector('a')!
    const notPrevented = a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(notPrevented).toBe(false) // preventDefault 生效，不跳相对 URL
    await new Promise((r) => setTimeout(r, 0))

    expect(a.getAttribute('href')).toBe('data:application/pdf;base64,PDF=')
    expect(a.classList.contains('is-not-downloaded')).toBe(false)
  })

  it('点未下载图片但下载失败：降级为「未镜像」占位', async () => {
    const root = makeRoot()
    const loader: AssetLoader = {
      async load() {
        return null
      },
      async cached() {
        return null
      }
    }
    await wireAssets(root, 'notes/x.md', loader, { autoDownload: false })

    const img = root.querySelector('img')!
    img.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 0))

    expect(img.getAttribute('src')).toBe(PLACEHOLDER_IMG)
  })
})
