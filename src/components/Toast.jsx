import { useAppStore } from '../store/useAppStore'

export default function Toast() {
  const { toastMsg, toastVisible } = useAppStore()
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--text)', color: '#fff', padding: '10px 20px',
      borderRadius: 99, fontSize: 14, zIndex: 500,
      opacity: toastVisible ? 1 : 0, transition: 'opacity 0.2s',
      pointerEvents: 'none', whiteSpace: 'nowrap'
    }}>
      {toastMsg}
    </div>
  )
}
