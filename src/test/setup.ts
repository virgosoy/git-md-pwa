import 'fake-indexeddb/auto'

// jsdom 缺 requestAnimationFrame；Preact 的 useEffect 依赖它做 after-paint 调度，
// 没有时会退化为 setTimeout，测试里出现时序竞态。补一个 setTimeout 实现的 rAF。
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number =>
    (setTimeout(() => cb(performance.now()), 0) as unknown) as number) as typeof requestAnimationFrame
}
if (typeof globalThis.cancelAnimationFrame !== 'function') {
  globalThis.cancelAnimationFrame = ((id: number): void =>
    clearTimeout(id)) as typeof cancelAnimationFrame
}

// jsdom 缺 SVG 测量 API，mermaid 排版渲染必须（07b 真 mermaid 冒烟用到）。
// 给最小桩即可——测试不断言布局几何。
const svgProto =
  (typeof SVGElement !== 'undefined' ? SVGElement.prototype : null) as unknown as {
    getBBox?: () => { x: number; y: number; width: number; height: number }
    getComputedTextLength?: () => number
  } | null
if (svgProto && typeof svgProto.getBBox !== 'function') {
  svgProto.getBBox = () => ({ x: 0, y: 0, width: 1, height: 1 })
  svgProto.getComputedTextLength = () => 1
}
