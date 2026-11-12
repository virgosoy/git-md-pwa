// U4 · 更新横幅：顶栏下的细横幅（Q5 形态）。
// 纯展示：只做「状态 → 文案/按钮」映射，不碰存储与 SW；测试直接 render 断言字面量。

export interface UpdateBannerProps {
  /** 线上新版本串；null=没取到，显示通用文案 */
  live: string | null
  onApply: () => void
  onIgnore: () => void
}

export function UpdateBanner({ live, onApply, onIgnore }: UpdateBannerProps) {
  const label = live ? `发现新版本 ${live}` : '发现新版本，刷新以查看'
  return (
    <div class="update-banner" role="status">
      <span class="update-banner__text">📦 {label}</span>
      <span class="update-banner__actions">
        <button class="update-banner__btn" onClick={onApply}>
          刷新
        </button>
        <button class="update-banner__btn" onClick={onIgnore} aria-label="稍后再提示">
          稍后
        </button>
      </span>
    </div>
  )
}
