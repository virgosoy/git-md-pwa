import { useEffect, useState } from 'preact/hooks'
import type { CategoryUsage, StorageUsage as Usage } from './estimate'
import { estimateStorage } from './estimate'
import { formatBytes } from './format'
import { clearCachedAssets } from '../assets/store'
import { clearMirror } from '../mirror/store'

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

export interface StorageUsageProps {
  /** 同步进行中：禁用会清空镜像的动作，避免「边拉边清」让提示与最终状态不一致 */
  syncing?: boolean
  /** 笔记镜像清空后通知 App 刷新列表 / 最近 / 同步横幅 */
  onMirrorCleared?: () => void
}

interface StorageActionProps {
  label: string
  disabled?: boolean
  disabledHint?: string
  confirmText: string
  busyText: string
  confirmLabel: string
  errorText: string
  /** 执行清理；成功时返回结果提示，抛错=失败 */
  onConfirm: () => Promise<string>
  /** 成功后刷新统计 */
  onSuccess: () => Promise<void> | void
}

/** 两步确认的清理动作：按钮 → 确认行 → 成功/失败提示，状态自持。 */
function StorageAction({
  label,
  disabled = false,
  disabledHint,
  confirmText,
  busyText,
  confirmLabel,
  errorText,
  onConfirm,
  onSuccess
}: StorageActionProps) {
  const [confirming, setConfirming] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeError, setNoticeError] = useState(false)

  async function run(): Promise<void> {
    setClearing(true)
    setNotice(null)
    try {
      const done = await onConfirm()
      setNotice(done)
      setNoticeError(false)
      setConfirming(false)
      await onSuccess()
    } catch {
      setNotice(errorText)
      setNoticeError(true)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div class="storage__actions">
      {confirming ? (
        <>
          <p class="storage__confirm">{confirmText}</p>
          <div class="storage__buttons">
            <button
              type="button"
              class="btn btn--danger"
              onClick={() => void run()}
              disabled={clearing || disabled}
            >
              {clearing ? busyText : confirmLabel}
            </button>
            <button
              type="button"
              class="btn"
              onClick={() => setConfirming(false)}
              disabled={clearing}
            >
              取消
            </button>
          </div>
        </>
      ) : (
        <div class="storage__buttons">
          <button
            type="button"
            class="btn"
            onClick={() => {
              setNotice(null)
              setConfirming(true)
            }}
            disabled={disabled}
          >
            {label}
          </button>
          {disabled && disabledHint && <span class="field__hint">{disabledHint}</span>}
        </div>
      )}
      {notice && (
        <p class={noticeError ? 'storage__notice storage__notice--error' : 'storage__notice'}>
          {notice}
        </p>
      )}
    </div>
  )
}

export function StorageUsage({ syncing = false, onMirrorCleared }: StorageUsageProps) {
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

  /** 清理后原地重算，不要求重开设置页。 */
  async function refresh(): Promise<void> {
    try {
      setUsage(await estimateStorage())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  const rows = usage ? [usage.notes, usage.assets, usage.cache, usage.settings] : []
  const complete = rows.every((r): r is CategoryUsage => r !== null)
  const overhead = complete ? rows.reduce((sum, r) => sum + r.overheadBytes, 0) : null
  const total =
    complete && overhead !== null
      ? rows.reduce((sum, r) => sum + r.contentBytes, 0) + overhead
      : null
  const notes = usage?.notes ?? null
  const assets = usage?.assets ?? null
  const canClearAssets = assets !== null && assets.count > 0

  function notesAction() {
    const notesUnavailable = notes === null
    const clearable = notes !== null && notes.count + notes.skipped > 0
    const disabled = syncing || !clearable
    const disabledHint = notesUnavailable
      ? '笔记数据读取失败，无法清空'
      : syncing
        ? '同步进行中，完成后再试'
        : !clearable
          ? '本机没有已镜像的笔记'
          : undefined
    const skippedClause =
      notes && notes.skipped > 0
        ? `（另有 ${notes.skipped} 篇超大未镜像，约 ${formatBytes(notes.contentBytes)}）`
        : ''
    const sizeClause = notes && notes.skipped === 0 ? `（约 ${formatBytes(notes.contentBytes)}）` : ''
    return (
      <StorageAction
        label="清空笔记镜像"
        disabled={disabled}
        disabledHint={disabledHint}
        confirmText={`将删除本机镜像的 ${notes?.count ?? 0} 篇笔记${skippedClause}${sizeClause}。同步记录、阅读位置与最近打开也会清除；设置和已缓存的图片不受影响。离线时将无法阅读；联网后点右上「刷新」可重新镜像。`}
        busyText="清空中…"
        confirmLabel="确认清空"
        errorText="清空失败，请重试。"
        onConfirm={async () => {
          const { count, bytes } = await clearMirror()
          onMirrorCleared?.()
          return `已清空本机笔记（${count} 篇，约 ${formatBytes(bytes)}）`
        }}
        onSuccess={refresh}
      />
    )
  }

  function assetsAction() {
    if (!assets) return null
    return (
      <StorageAction
        label="清理图片等资源缓存"
        disabled={!canClearAssets}
        disabledHint={!canClearAssets ? '没有已缓存的资源' : undefined}
        confirmText={`将清除 ${assets.count} 个资源（约 ${formatBytes(assets.contentBytes)}）。离线时这些图片将不再显示；联网重新打开笔记会再次下载。`}
        busyText="清理中…"
        confirmLabel="确认清理"
        errorText="清理失败，请重试。"
        onConfirm={async () => {
          const { count, bytes } = await clearCachedAssets()
          return `已清理 ${count} 个资源（约 ${formatBytes(bytes)}）`
        }}
        onSuccess={refresh}
      />
    )
  }

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

          {notesAction()}

          <div class="storage__row">
            <span class="storage__name">图片等资源</span>
            <span class="storage__count">
              {countText(usage.assets, '个', '个超大未缓存')}
            </span>
            <span class="storage__size">{sizeText(rowBytes(usage.assets))}</span>
          </div>

          {assetsAction()}

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
