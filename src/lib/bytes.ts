// 字节估算：JS 引擎内部的字符串表示（Latin-1 一字节 / UTF-16 两字节）。
// 存储统计（src/storage/estimate.ts）与清理操作（src/mirror/store.ts）共用同一口径，
// 放在中立模块避免 storage ↔ mirror 循环依赖。

const NON_LATIN1 = /[^\u0000-ÿ]/

/** 字符串在 JS 引擎内部的字节估算：Latin-1 一字节表示，否则 UTF-16 两字节表示。 */
export function stringBytes(value: string): number {
  return NON_LATIN1.test(value) ? value.length * 2 : value.length
}
