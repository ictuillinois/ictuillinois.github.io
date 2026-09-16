import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'

// Safety Data Sheets and related reference material.
//
// Org content, not personal: everyone in the lab reads the same sheets, so
// these go straight to Supabase storage rather than through StorageService's
// per-user provider. A lab user who had picked Google Drive would otherwise
// upload into their own Drive, where nobody else could open it.
const BUCKET = 'lab-files'

const KINDS = {
  pdf:   { icon: '📄', label: 'PDF' },
  doc:   { icon: '📝', label: 'Document' },
  video: { icon: '🎬', label: 'Video' },
  link:  { icon: '🔗', label: 'Link' },
  file:  { icon: '📎', label: 'File' },
}

function kindOf(name = '', isLink = false) {
  if (isLink) return 'link'
  const e = name.split('.').pop()?.toLowerCase()
  if (e === 'pdf') return 'pdf'
  if (['doc', 'docx', 'rtf', 'odt', 'txt'].includes(e)) return 'doc'
  if (['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(e)) return 'video'
  return 'file'
}

const ACCEPT = '.pdf,.doc,.docx,.rtf,.odt,.txt,.mp4,.mov,.webm,.m4v,.avi,.mkv'

function prettySize(bytes) {
  if (!bytes) return ''
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export default function SDSTab({ session, readOnly = false }) {
  const { toast } = useAppStore()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [showLink, setShowLink] = useState(false)
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const fileRef = useRef()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let q = sb.from('sds_documents').select('*').order('created_at', { ascending: false })
    if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
    const { data, error } = await q
    setLoading(false)
    // Read the error: a missing table or a policy that rejects the read both
    // return zero rows, and an empty list would look like "nothing uploaded".
    if (error) { toast('Could not load SDS documents: ' + error.message, true); return }
    setRows(data || [])
  }

  async function onPick(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    let ok = 0
    for (const file of files) {
      const safe = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `sds/${session?.organizationId || 'org'}/${Date.now()}_${safe}`
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file)
      if (upErr) { toast(`Upload failed for ${file.name}: ${upErr.message}`, true); continue }
      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
      const { error: insErr } = await sb.from('sds_documents').insert({
        title: file.name.replace(/\.[^.]+$/, ''),
        kind: kindOf(file.name),
        file_url: pub.publicUrl,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        organization_id: session?.organizationId || null,
        created_by: session?.userId || null,
      })
      if (insErr) { toast(`Could not save ${file.name}: ${insErr.message}`, true); continue }
      ok++
    }
    setUploading(false)
    if (ok) toast(`${ok} document${ok !== 1 ? 's' : ''} added.`)
    load()
  }

  async function addLink() {
    const url = linkUrl.trim()
    if (!url) { toast('Enter a web address.', true); return }
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
    const { error } = await sb.from('sds_documents').insert({
      title: linkTitle.trim() || href.replace(/^https?:\/\//, '').split('/')[0],
      kind: 'link',
      link_url: href,
      organization_id: session?.organizationId || null,
      created_by: session?.userId || null,
    })
    if (error) { toast('Could not save the link: ' + error.message, true); return }
    setShowLink(false); setLinkTitle(''); setLinkUrl('')
    toast('Link added.')
    load()
  }

  async function remove(row) {
    if (!confirm(`Remove "${row.title}"? This cannot be undone.`)) return
    const { error } = await sb.from('sds_documents').delete().eq('id', row.id)
    if (error) { toast('Could not remove: ' + error.message, true); return }
    // Delete the stored file only after the row is gone. The other order can
    // leave a row pointing at a file that no longer exists.
    if (row.file_path) await sb.storage.from(BUCKET).remove([row.file_path])
    toast('Removed.')
    load()
  }

  const q = search.trim().toLowerCase()
  const shown = q ? rows.filter(r => `${r.title} ${r.file_name || ''} ${r.link_url || ''}`.toLowerCase().includes(q)) : rows

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input placeholder="Search SDS…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 260 }} />
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          {shown.length} document{shown.length !== 1 ? 's' : ''}
        </div>
        {!readOnly && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={onPick} />
            <button className="btn btn-sm" onClick={() => setShowLink(v => !v)}>🔗 Add link</button>
            <button className="btn btn-sm btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? 'Uploading…' : '⬆ Upload files'}
            </button>
          </div>
        )}
      </div>

      {!readOnly && showLink && (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
            <label>Title</label>
            <input value={linkTitle} onChange={e => setLinkTitle(e.target.value)} placeholder="e.g. Acetone SDS — Sigma-Aldrich" />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: '2 1 280px' }}>
            <label>Web address <span style={{ color: '#c84b2f' }}>*</span></label>
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" />
          </div>
          <button className="btn btn-sm btn-primary" onClick={addLink}>Add</button>
          <button className="btn btn-sm" onClick={() => setShowLink(false)}>Cancel</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : shown.length === 0 ? (
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="empty-icon">🧯</div>
          <div>{rows.length === 0
            ? (readOnly ? 'No safety data sheets have been posted yet.' : 'No safety data sheets yet. Upload a PDF, document or video, or add a link.')
            : 'Nothing matches that search.'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map((r, idx) => {
            const k = KINDS[r.kind] || KINDS.file
            const href = r.kind === 'link' ? r.link_url : r.file_url
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)' }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{k.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={href} target="_blank" rel="noreferrer"
                    style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent)', textDecoration: 'none', overflowWrap: 'anywhere' }}>
                    {r.title}
                  </a>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, overflowWrap: 'anywhere' }}>
                    {k.label}
                    {r.file_name ? ` · ${r.file_name}` : ''}
                    {r.file_size ? ` · ${prettySize(r.file_size)}` : ''}
                    {r.kind === 'link' && r.link_url ? ` · ${r.link_url.replace(/^https?:\/\//, '').split('/')[0]}` : ''}
                  </div>
                </div>
                <a className="btn btn-sm" href={href} target="_blank" rel="noreferrer" style={{ flexShrink: 0, textDecoration: 'none' }}>
                  Open ↗
                </a>
                {!readOnly && (
                  <button className="btn btn-sm" onClick={() => remove(r)}
                    style={{ color: '#c84b2f', flexShrink: 0 }}>Remove</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
