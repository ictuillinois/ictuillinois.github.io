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
// so the browser can't reuse the stale response.
//
// The guard is keyed to the buildId we are jumping TO, not a plain "have I
// ever reloaded" boolean. The boolean was loop-proof but went permanently
// blind: one recovery disabled the check for the life of the tab, so every
// later deploy went undetected. Keying by target buildId keeps the loop
// protection (a persistently-stale proxy re-offers the same buildId, which we
// have already attempted, so we stop) while still letting each genuinely new
// deploy get exactly one recovery attempt.
;(async () => {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
    const { buildId } = await res.json()
    if (!buildId || !window.__BUILD_ID__ || buildId === window.__BUILD_ID__) return
    if (sessionStorage.getItem('ictlab_update_reload_to') === buildId) return
    sessionStorage.setItem('ictlab_update_reload_to', buildId)
    // set(), not append — the old code concatenated a fresh _v= on every
    // recovery, so a tab that survived several deploys accumulated
    // ?_v=a&_v=b&_v=c… without bound.
    const url = new URL(window.location.href)
    url.searchParams.set('_v', buildId)
    window.location.replace(url.toString())
  } catch {}
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
