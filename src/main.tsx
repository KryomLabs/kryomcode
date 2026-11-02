import React from 'react'
import { createRoot } from 'react-dom/client'
import './utils/monaco-setup'
import App from './app/App'
import { ErrorBoundary } from './components/ErrorBoundary'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/tokens.css'
import './styles/app.css'
import './styles/meta-ai.css'
import './styles/theme.css'
import './styles/hero.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element "#root" was not found in index.html')
}

createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
