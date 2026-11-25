// 行尾与 BOM 保真：编辑在 textarea 里进行时，浏览器把 CRLF 规范成 LF；
// 保存前按原文件风格还原，避免手机改一个字、GitHub 显示整文件重写。
// 混合行尾统一成 LF（无法逐行还原，且 Markdown 对 LF 是常态）。

export type Eol = 'lf' | 'crlf'

/** 统一 CRLF → LF；裸 CR（旧 Mac）也收敛成 LF。 */
export function toLf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** 原文件是否「只有 CRLF」；没有任何 CRLF 或混有裸 LF 都按 LF 处理。 */
export function detectEol(text: string): Eol {
  if (!text.includes('\r\n')) return 'lf'
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n' && text[i - 1] !== '\r') return 'lf'
  }
  return 'crlf'
}

/** 把（textarea 产出的）LF 文本按原文件行尾还原。 */
export function applyEol(text: string, eol: Eol): string {
  const lf = toLf(text)
  return eol === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf
}

/** 去掉开头 BOM；本应用不保留 BOM。 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
