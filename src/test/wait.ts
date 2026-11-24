/**
 * 测试辅助：轮询直到条件成立（等异步统计/DOM 更新落地）。
 * 用真实时间等待（每步 setTimeout(10)），给防抖/定时器留出时间；
 * 超时直接抛错——静默返回会让后面的断言报出一个与根因无关的失败。
 */
const WAIT_STEP_MS = 10

export async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`waitFor 超时（${timeoutMs}ms）：条件始终不成立`)
    }
    await new Promise((r) => setTimeout(r, WAIT_STEP_MS))
  }
}
