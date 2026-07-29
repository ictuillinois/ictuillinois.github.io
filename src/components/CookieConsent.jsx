import { useState, useEffect } from 'react'

const GA_ID = 'G-62P1FB2VDT'

export function loadGA() {
  if (window._gaLoaded) return
  window._gaLoaded = true
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(s)
  window.dataLayer = window.dataLayer || []
  window.gtag = function () { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  window.gtag('config', GA_ID)
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('ictlab_cookie_consent')
    if (!stored) {
      setTimeout(() => setVisible(true), 800)
    } else if (stored === 'all') {
      loadGA()
    }
  }, [])

  const acceptAll = () => {
    localStorage.setItem('ictlab_cookie_consent', 'all')
    loadGA()
    setVisible(false)
  }

  const essentialOnly = () => {
    localStorage.setItem('ictlab_cookie_consent', 'essential')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <>
      <style>{`
        @keyframes cc-rise {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div style={{
        position: 'fixed', bottom: 20, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        width: 'calc(100% - 32px)', maxWidth: 820,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(12px)',
        border: '1px solid #e0ddd4',
        borderRadius: 14,
        boxShadow: '0 4px 32px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)',
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        animation: 'cc-rise 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* Icon */}
        <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: 'linear-gradient(135deg, #0d47a1, #1D9E75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1916' }}>We use cookies </span>
          <span style={{ fontSize: 13, color: '#6b6860' }}>to keep the app running and understand how it's used (Google Analytics). No data is sold or used for ads.</span>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={essentialOnly}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e0ddd4', background: '#fff', color: '#1a1916', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.13s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f4f3ef'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            Essential Only
          </button>
          <button
            onClick={acceptAll}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #0d47a1, #1565c0)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'filter 0.13s' }}
            onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseLeave={e => e.currentTarget.style.filter = 'none'}
          >
            Accept All
          </button>
        </div>
      </div>
    </>
  )
}
