import ReactDOM from 'react-dom/client'
import '@fontsource-variable/roboto-flex'
import '@fontsource/roboto-mono/400.css'
import '@fontsource/roboto-mono/500.css'
import './styles/tokens.css'
import './styles/app.css'
import './i18n'
import App, { MissingApi } from './App'
import { AppProvider } from './state/AppContext'
import { hasApi } from './lib/api'

const container = document.getElementById('root')

if (container) {
  const root = ReactDOM.createRoot(container)
  root.render(hasApi() ? <AppProvider><App /></AppProvider> : <MissingApi />)
}
