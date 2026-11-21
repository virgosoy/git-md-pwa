import { useEffect, useState } from 'preact/hooks'
import type { CategoryUsage, StorageUsage as Usage } from './estimate'
import { estimateStorage } from './estimate'
import { formatBytes } from './format'

// 设置页「本机存储」：打开时统计一次（读 IDB 四表 + Cache Storage）。
// 任一类失败 → 该行与总量显示「—」，附重试提示，不让错误整块消失或当 0。

// 分类行只展示数据本体；记录字段/主键/缓存元数据统一进「记录与索引开销」，
// 避免同一份开销在分类行与开销行重复计入总量。

function rowBytes(u: CategoryUsage | null): number | null {
  return u ? u.contentBytes : null
}

function countText(u: CategoryUsage | null, unit: string, skippedText?: string): string {
  if (!u) return '—'
  const base = `${u.count} ${unit}`
  return u.skipped > 0 && skippedText ? `${base}（另有 ${u.skipped} ${skippedText}）` : base
}

function sizeText(bytes: number | null): string {
  return bytes === null ? '—' : formatBytes(bytes)
}

export function StorageUsage() {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    estimateStorage().then(
      (u) => {
        if (alive) setUsage(u)
      },
      () => {
        if (alive) setFailed(true)
      }
    )
    return () => {
      alive = false
    }
  }, [])

  const rows = usage ? [usage.notes, usage.assets, usage.cache, usage.settings] : []
  const complete = rows.every((r): r is CategoryUsage => r !== null)
  const overhead = complete ? rows.reduce((sum, r) => sum + r.overheadBytes, 0) : null
  const total =
    complete && overhead !== null
      ? rows.reduce((sum, r) => sum + r.contentBytes, 0) + overhead
      : null

  return (
    <div class="field">
      <span class="field__label">本机存储</span>
      {failed ? (
        <span class="field__hint">统计失败，重新打开设置可重试。</span>
      ) : !usage ? (
        <span class="field__hint">统计中…</span>
      ) : (
        <div class="storage">
          <div class="storage__total">共 {total === null ? '—' : formatBytes(total)}</div>

          <div class="storage__row">
            <span class="storage__name">笔记</span>
            <span class="storage__count">{countText(usage.notes, '篇', '篇超大未镜像')}</span>
            <span class="storage__size">{sizeText(rowBytes(usage.notes))}</span>
          </div>

          <div class="storage__row">
            <span class="storage__name">图片等资源</span>
            <span class="storage__count">
              {countText(usage.assets, '个', '个超大未缓存')}
            </span>
            <span class="storage__size">{sizeText(rowBytes(usage.assets))}</span>
          </div>

          <div class="storage__row">
            <span class="storage__name">应用离线缓存</span>
            <span class="storage__count">{countText(usage.cache, '项')}</span>
            <span class="storage__size">{sizeText(rowBytes(usage.cache))}</span>
          </div>

          <div class="storage__row">
            <span class="storage__name">设置与阅读数据</span>
            <span class="storage__count">{countText(usage.settings, '项')}</span>
            <span class="storage__size">{sizeText(rowBytes(usage.settings))}</span>
          </div>

          <div class="storage__row">
            <span class="storage__name">记录与索引开销</span>
            <span class="storage__count" />
            <span class="storage__size">
              {overhead === null ? '—' : formatBytes(overhead)}
            </span>
          </div>

          <p class="field__hint">
            统计的是应用保存在浏览器里的数据量和记录字段；浏览器底层的页对齐、压缩、日志等开销无法从网页读取，未计入。
          </p>
          {!complete && (
            <p class="field__hint">部分数据读取失败，重新打开设置可重试。</p>
          )}
        </div>
      )}
    </div>
  )
}
