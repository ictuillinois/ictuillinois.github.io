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

// Auto-recover from a cached-stale index.html. Every build stamps a unique
// window.__BUILD_ID__ (see post-build.mjs) and writes the same value to
// /version.json. If an intermediate cache (CDN, corporate proxy, browser)
// serves an old index.html, a plain reload just re-fetches the SAME stale
// HTML from cache — this instead fetches version.json with cache disabled,
// and if it doesn't match, force-navigates with a cache-busting query param
// so the browser can't reuse the stale response. sessionStorage guard limits
// this to one attempt per tab so a persistently-stale proxy can't loop.
;(async () => {
  try {
    if (sessionStorage.getItem('ictlab_update_reload')) return
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
    const { buildId } = await res.json()
    if (buildId && window.__BUILD_ID__ && buildId !== window.__BUILD_ID__) {
      sessionStorage.setItem('ictlab_update_reload', '1')
      window.location.href = window.location.pathname + window.location.search +
        (window.location.search ? '&' : '?') + '_v=' + buildId + window.location.hash
    }
  } catch {}
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
