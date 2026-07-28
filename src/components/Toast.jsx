import { useAppStore } from '../store/useAppStore'

export default function Toast() {
  const { toastMsg, toastVisible, toastIsError, dismissToast } = useAppStore()

  if (!toastVisible) return null

  if (toastIsError) {
    return (
      <div style={{
        position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        background: '#1e1e2e', color: '#fff',
        borderRadius: 12, zIndex: 9000,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        minWidth: 300, maxWidth: 480, width: 'max-content',
        border: '1px solid #c0392b',
        overflow: 'hidden',
      }}>
        <div style={{ background: '#c0392b', padding: '8px 16px', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6.5" stroke="white" strokeWidth="1.2"/><path d="M7 4v3.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/><circle cx="7" cy="10" r="0.8" fill="white"/></svg>
          Error
        </div>
        <div style={{ padding: '14px 16px 6px', fontSize: 14, lineHeight: 1.5 }}>
          {toastMsg}
        </div>
        <div style={{ padding: '8px 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={dismissToast}
            style={{ padding: '6px 20px', background: '#c0392b', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            OK
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--text)', color: '#fff', padding: '10px 20px',
      borderRadius: 99, fontSize: 14, zIndex: 9000,
      pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      {toastMsg}
    </div>
  )
}
