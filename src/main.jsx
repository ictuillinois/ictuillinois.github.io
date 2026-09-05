import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Auto-recover from stale deployments. Lazy chunks (jspdf, exceljs, …) have
// hashed filenames that change on every deploy; a browser holding an old
// index.html requests a chunk that no longer exists and the dynamic import
// fails ("jspdf failed" on Windows machines with older cache). Vite fires
// vite:preloadError for exactly this case — reload once to fetch the fresh
// build. sessionStorage guard prevents a reload loop if something else broke.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  const last = parseInt(sessionStorage.getItem('ictlab_chunk_reload') || '0', 10)
  if (Date.now() - last < 15_000) return  // one reload per 15s — prevents loops
  sessionStorage.setItem('ictlab_chunk_reload', String(Date.now()))
  window.location.reload()
})

// Apply tooltip preference before first render
if (localStorage.getItem('ictlab_show_tooltips') === 'false') {
  document.body.classList.add('tooltips-off')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
