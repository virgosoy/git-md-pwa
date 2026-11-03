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
