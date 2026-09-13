import { useEffect, useState } from 'react'

// "New version available" prompt for long-lived tabs.
//
// Why this exists: main.jsx recovers from a stale index.html and from lazy
// chunks deleted by a newer deploy, but both are *reactive* — they fire at
// page load, or at the moment a missing chunk is requested. A tab left open
// all day never reloads and may never request a new chunk, so it can sit for
// hours running code a deploy has already replaced. Nothing looks broken; the
// user simply doesn't have fixes that shipped.
//
// This polls the same version.json the startup check uses and offers a reload.
// It deliberately NEVER navigates on its own: a forced reload mid-form would
// destroy unsaved material/project entry. The user decides when.
const POLL_MS = 5 * 60 * 1000   // background poll
const FOCUS_THROTTLE_MS = 60 * 1000  // re-check on tab focus, at most this often

export default function UpdateBanner() {
  const [newBuildId, setNewBuildId] = useState(null)

  useEffect(() => {
    let cancelled = false
    let lastCheck = 0

    async function check() {
      // No build stamp (dev server) — nothing to compare against.
      if (!window.__BUILD_ID__) return
      lastCheck = Date.now()
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
        if (!res.ok) return
        const { buildId } = await res.json()
        if (cancelled || !buildId || buildId === window.__BUILD_ID__) return
        // Respect a dismissal, but only for that exact build — a newer deploy
        // is allowed to prompt again.
        if (sessionStorage.getItem('ictlab_update_dismissed') === buildId) return
        setNewBuildId(buildId)
      } catch {
        // Offline or blocked — stay silent and try again on the next tick.
      }
    }

    const interval = setInterval(check, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > FOCUS_THROTTLE_MS) check()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!newBuildId) return null

  function reload() {
    // Mark the target build as already-attempted so main.jsx's startup check
    // doesn't immediately navigate a second time for the same build.
    try { sessionStorage.setItem('ictlab_update_reload_to', newBuildId) } catch {}
    const url = new URL(window.location.href)
    url.searchParams.set('_v', newBuildId)
    window.location.replace(url.toString())
  }

  function dismiss() {
    try { sessionStorage.setItem('ictlab_update_dismissed', newBuildId) } catch {}
    setNewBuildId(null)
  }

  return (
    <div className="update-banner" role="status">
      <span style={{ fontSize: 16, lineHeight: 1 }}>✨</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>New version available</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Reload to get the latest fixes.</div>
      </div>
      <button onClick={reload} className="btn btn-sm btn-primary" style={{ flexShrink: 0 }}>Reload</button>
      <button onClick={dismiss} title="Dismiss" aria-label="Dismiss"
        style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: 4 }}>
        ✕
      </button>
    </div>
  )
}
