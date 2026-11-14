import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* hash routing works from any sub-path (GitHub Pages serves under /<repo>/) */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
