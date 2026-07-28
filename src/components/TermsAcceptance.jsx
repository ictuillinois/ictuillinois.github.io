import { useState } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'
import { CURRENT_TERMS_VERSION } from '../lib/termsVersion'

export default function TermsAcceptance({ session, onAccept }) {
  const { clearSession, setSession, toast } = useAppStore()
  const [saving, setSaving] = useState(false)
  const [declined, setDeclined] = useState(false)

  async function handleAccept() {
    setSaving(true)
    const table = session.loginMode === 'solo' ? 'solo_users' : 'users'
    const { error } = await sb.from(table)
      .update({ terms_accepted_version: CURRENT_TERMS_VERSION })
      .eq('id', session.userId)
    if (error) {
      console.error('Failed to save terms acceptance:', error)
      toast('Could not save your acceptance — please ask your admin to run the required DB migration.')
    }
    const updated = { ...session, termsAcceptedVersion: CURRENT_TERMS_VERSION }
    setSession(updated)
    localStorage.setItem('ictlab_session', JSON.stringify(updated))
    setSaving(false)
    onAccept()
  }

  function handleDecline() {
    setDeclined(true)
  }

  function handleSignOut() {
    clearSession()
  }

  if (declined) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0C1140', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 22, color: '#fff', marginBottom: 14 }}>Access Denied</div>
          <div style={{ fontSize: 15, color: '#FF9A4A', lineHeight: 1.7, marginBottom: 32, background: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 20px' }}>
            You must accept the Terms of Service to use ICT-Lab.
            Contact your lab administrator if you have questions.
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setDeclined(false)}
              style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              ← Review Terms
            </button>
            <button onClick={handleSignOut}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#FF6B1A', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 12px 48px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>

        {/* Header */}
        <div style={{ background: '#0C1140', padding: '20px 28px', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 19, color: '#fff', marginBottom: 4 }}>
            {session.termsAcceptedVersion ? '📋 Terms Updated' : '👋 Welcome to ICT-Lab'}
          </div>
          <div style={{ fontSize: 13, color: '#FF9A4A' }}>
            {session.termsAcceptedVersion
              ? 'Our Terms of Service have been updated. Please review and accept to continue.'
              : 'Before you begin, please review and accept the ICT-Lab Terms of Service.'}
          </div>
        </div>

        {/* Scrollable summary */}
        <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1, fontSize: 13, color: 'var(--text2)', lineHeight: 1.75, borderBottom: '1px solid var(--border)' }}>
          <p style={{ marginBottom: 12, fontWeight: 600, color: 'var(--text)' }}>Key points before you begin:</p>
          <ul style={{ marginLeft: 16, marginBottom: 16 }}>
            <li style={{ marginBottom: 8 }}><strong>Keep your credentials private.</strong> Never share your username or password with anyone. You are responsible for all activity under your account.</li>
            <li style={{ marginBottom: 8 }}><strong>Authorized use only.</strong> ICT-Lab is for ICT personnel only. Use it solely for your assigned work responsibilities.</li>
            <li style={{ marginBottom: 8 }}><strong>Accurate records.</strong> All entries — inspections, training, bookings, maintenance logs — must be truthful. Falsification is a serious violation.</li>
            <li style={{ marginBottom: 8 }}><strong>Report issues promptly.</strong> Equipment problems, account security concerns, or policy questions should be sent to <strong>ResearchengineersICT@illinois.edu</strong>.</li>
            <li style={{ marginBottom: 0 }}>Your use of this platform must comply with the <strong>ICT Laboratory Policy</strong>. A copy is linked in the full Terms of Service.</li>
          </ul>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <a href="/terms/" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 14px', background: '#f0f4ff', border: '1px solid #c7d7f9', borderRadius: 8, color: '#1a56db', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
              📋 Read Full Terms of Service ↗
            </a>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ padding: '20px 28px', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>
            By clicking <strong>Accept</strong>, you confirm you have read and agree to the ICT-Lab Terms of Service (version {CURRENT_TERMS_VERSION}).
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={handleDecline}
              style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#c0392b'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
              Decline
            </button>
            <button onClick={handleAccept} disabled={saving}
              style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: saving ? 'var(--border)' : '#0C1140', color: saving ? 'var(--text3)' : '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
              {saving ? 'Saving…' : '✓ Accept & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
