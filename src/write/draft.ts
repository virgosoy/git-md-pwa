// 本机草稿：编辑中的未提交内容，按 path 唯一保存在 IDB `drafts` 表。
// 草稿不属于仓库镜像，也不随同步更新；保存失败/离线/退出编辑器时保留。

import { STORE_DRAFTS, withStore } from '../idb'
import type { Eol } from '../lib/eol'

export interface DraftRecord {
  path: string
  /** textarea 的 LF 文本（保存时按 eol 还原） */
  content: string
  /** 进入编辑时镜像文件的 blob sha（提交前置条件） */
  baseSha: string
  /** 原文件行尾风格 */
  eol: Eol
  updatedAt: number
}

/** 单文件允许手机编辑的上限（Contents API 的可靠区间） */
export const MAX_EDIT_BYTES = 1024 * 1024

/** 输入防抖写草稿的间隔 */
export const DRAFT_SAVE_DELAY_MS = 500

export async function loadDraft(path: string): Promise<DraftRecord | undefined> {
  return withStore<DraftRecord | undefined>(STORE_DRAFTS, (s) => s.get(path))
}

export async function saveDraft(draft: DraftRecord): Promise<void> {
  await withStore(STORE_DRAFTS, (s) => s.put(draft))
}

export async function deleteDraft(path: string): Promise<void> {
  await withStore(STORE_DRAFTS, (s) => s.delete(path))
}

export async function listDraftPaths(): Promise<string[]> {
  const keys = await withStore<IDBValidKey[]>(STORE_DRAFTS, (s) => s.getAllKeys())
  return keys.map(String).sort((a, b) => a.localeCompare(b))
}

export async function loadDrafts(): Promise<DraftRecord[]> {
  const all = await withStore<DraftRecord[]>(STORE_DRAFTS, (s) => s.getAll())
  return all.sort((a, b) => a.path.localeCompare(b.path))
}
