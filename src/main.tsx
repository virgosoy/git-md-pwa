import { render } from 'preact'
import { App } from './app'
import { registerSW } from 'virtual:pwa-register'
import './styles.css'

registerSW({ immediate: true })

render(<App />, document.getElementById('app')!)
