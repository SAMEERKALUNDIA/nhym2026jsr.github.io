import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import './index.css'

// Locked file: the mount point is the platform's, not the site's. The "Made
// with AI Fiesta" badge is added at the edge, so a plan change toggles it
// without rebuilding the site.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
