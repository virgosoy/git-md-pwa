/** 测试辅助：轮询直到条件成立（等异步统计/DOM 更新落地），超时即返回。 */
export async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 0))
  }
}
