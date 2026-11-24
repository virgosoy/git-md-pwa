// L1 · 异步小工具：超时兜底。超时或 reject 都落回 fallback，绝不悬挂。
// 放在中立模块，避免 updates 内部各文件各写一份（行为还容易分叉）。

export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms)
    void p.then(
      (v) => {
        window.clearTimeout(timer)
        resolve(v)
      },
      () => {
        window.clearTimeout(timer)
        resolve(fallback)
      }
    )
  })
}
