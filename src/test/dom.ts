/** 测试辅助：按可见文本找按钮，找不到直接报错（文案即断言的锚点）。 */
export function button(root: HTMLElement, text: string): HTMLButtonElement {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent === text)
  if (!b) throw new Error(`未找到按钮：${text}`)
  return b as HTMLButtonElement
}
