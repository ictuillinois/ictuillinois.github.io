import { useAppStore } from '../store/useAppStore'

export default function Toast() {
  const { toastMsg, toastVisible, toastIsError, dismissToast } = useAppStore()

  if (!toastVisible) return null

  if (toastIsError) {
    return (
      <div style={{
        position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        background: '#fff',
        borderRadius: 14, zIndex: 9000,
        boxShadow: '0 4px 24px rgba(0,0,0,0.13)',
        minWidth: 300, maxWidth: 460, width: 'max-content',
        border: '1.5px solid #fca5a5',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#ef4444" strokeWidth="1.5"/><path d="M9 5.5v4" stroke="#ef4444" strokeWidth="1.6" strokeLinecap="round"/><circle cx="9" cy="12.5" r="1" fill="#ef4444"/></svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#b91c1c', marginBottom: 2 }}>Something went wrong</div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{toastMsg}</div>
          </div>
        </div>
        <div style={{ padding: '0 16px 14px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={dismissToast}
            style={{ padding: '6px 22px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
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
