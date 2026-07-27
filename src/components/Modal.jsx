export default function Modal({ children, onClose }) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
        {children}
      </div>
    </div>
  )
}
