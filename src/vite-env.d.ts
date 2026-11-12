/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** 构建时经 vite define 注入：v<pkg.version>+<git 短 sha>；开发/测试环境未注入。 */
declare const __APP_VERSION__: string
