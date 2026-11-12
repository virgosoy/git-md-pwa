import { render } from 'preact'
import { App } from './app'
import './styles.css'

// SW 注册移入 useUpdate（prompt 模式的 onNeedRefresh / onRegisteredSW / 周期复查都在这）
render(<App />, document.getElementById('app')!)
