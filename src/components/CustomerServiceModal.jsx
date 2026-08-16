import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { sb } from '../lib/supabase'
import Modal from './Modal'

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
])
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export default function CustomerServiceModal({ onClose }) {
  const { session, toast } = useAppStore()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [email, setEmail]     = useState(session?.email || '')
  const [file, setFile]       = useState(null)
  const [fileError, setFileError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]       = useState(false)

  function handleFileChange(e) {
    setFileError('')
    const f = e.target.files[0] || null
    if (!f) { setFile(null); return }
    if (!ALLOWED_TYPES.has(f.type)) {
      setFileError('Only images, PDFs, Word documents, and plain text files are allowed.')
      e.target.value = ''
      return
    }
    if (f.size > MAX_FILE_SIZE) {
      setFileError('File must be under 10 MB.')
      e.target.value = ''
      return
    }
    setFile(f)
  }

  async function submit() {
    if (!subject.trim()) { toast('Please enter a subject.'); return }
    if (!message.trim()) { toast('Please describe your issue or feedback.'); return }
    if (!email.trim())   { toast('Please enter your email address so we can reply.'); return }
    setSubmitting(true)
    try {
      let attachment_url = null
      if (file) {
        const path = `support/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error: upErr } = await sb.storage.from('project-files').upload(path, file, { contentType: file.type })
        if (upErr) throw new Error('File upload failed: ' + upErr.message)
        attachment_url = sb.storage.from('project-files').getPublicUrl(path).data.publicUrl
      }
      const { error } = await sb.from('support_messages').insert({
        user_id: session?.userId || null,
        user_email: email.trim().toLowerCase(),
        user_name: session?.username || null,
        subject: subject.trim(),
        message: message.trim(),
        attachment_url,
        status: 'open',
      })
      if (error) throw new Error(error.message)
      setDone(true)
    } catch (e) {
      toast('Failed to send: ' + (e.message || e))
    }
    setSubmitting(false)
  }

  if (done) return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Message sent!</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 24 }}>
          We received your message and will reply to <strong>{email}</strong> as soon as possible.
        </div>
        <button className="btn btn-primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>💬 Contact Customer Service</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20, lineHeight: 1.5 }}>
        Have a question, issue, or feedback? We'll reply to your email.
      </div>

      {session?.email ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, marginBottom: 16, border: '1px solid var(--border)' }}>
          <span style={{ fontSize: 18 }}>✉️</span>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>Reply will be sent to</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{session.email}</div>
          </div>
        </div>
      ) : (
        <div className="field">
          <label>Your email address <span style={{ color: '#c84b2f' }}>*</span></label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
          />
        </div>
      )}

      <div className="field">
        <label>Subject <span style={{ color: '#c84b2f' }}>*</span></label>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="e.g. Can't log in, Feature request…"
        />
      </div>

      <div className="field">
        <label>Message <span style={{ color: '#c84b2f' }}>*</span></label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Describe your issue or feedback in detail…"
          rows={5}
          style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 14 }}
        />
      </div>

      <div className="field">
        <label>Attach a file (optional)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: 'var(--surface2)', fontWeight: 500 }}>
            📎 {file ? file.name : 'Choose file'}
            <input type="file" accept="image/*,.pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={handleFileChange} />
          </label>
          {file && (
            <button onClick={() => { setFile(null); setFileError('') }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1 }}>×</button>
          )}
        </div>
        {file && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{Math.round(file.size / 1024)} KB · {file.type}</div>}
        {fileError && <div style={{ fontSize: 12, color: '#c0392b', marginTop: 4 }}>⚠️ {fileError}</div>}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={submit} disabled={submitting} style={{ flex: 1 }}>
          {submitting ? 'Sending…' : 'Send message'}
        </button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}
