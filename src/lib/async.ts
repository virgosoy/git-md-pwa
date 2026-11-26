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

/**
 * 超时 reject；其它 rejection 原样透传。
 * 用于写操作：失败必须让调用方看见（403/409 不能被吞成超时），
 * 与 withTimeout 的「失败也要有值」语义相反。
 */
export function withTimeoutReject<T>(
  p: Promise<T>,
  ms: number,
  onTimeout: () => Error
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(onTimeout()), ms)
    p.then(
      (v) => {
        window.clearTimeout(timer)
        resolve(v)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      }
    )
  })
}
