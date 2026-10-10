import { useState, useEffect, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// A PDF shown one page at a time, as steps, ending in a confirmation.
//
// The pages are the published document itself, drawn by pdf.js — its
// pictures and layout exactly as printed, nothing re-typed. Confirming is only
// possible on the last page, after every page has been shown: reaching the
// end is what "I have read it" has to mean.
//
// steps: optional short titles, one per page, shown above the page.
export default function PdfSteps({ url, title, steps = [], confirmLabel, busy = false, onConfirm }) {
  const [doc, setDoc] = useState(null)
  const [err, setErr] = useState('')
  const [page, setPage] = useState(1)
  const [seen, setSeen] = useState(1)
  const [agree, setAgree] = useState(false)
  const canvasRef = useRef(null)
  const boxRef = useRef(null)
  const taskRef = useRef(null)

  useEffect(() => {
    let off = false
    fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer() })
      .then(data => pdfjsLib.getDocument({ data }).promise)
      .then(d => { if (!off) setDoc(d) })
      .catch(e => { console.error('[PdfSteps] load failed:', e); if (!off) setErr('The manual could not be loaded. Check your connection and try again.') })
    return () => { off = true }
  }, [url])

  useEffect(() => {
    if (!doc || !canvasRef.current) return
    let off = false
    ;(async () => {
      try { taskRef.current?.cancel() } catch { /* already done */ }
      const pg = await doc.getPage(page)
      if (off || !canvasRef.current) return
      const base = pg.getViewport({ scale: 1 })
      const width = Math.min((boxRef.current?.clientWidth || 680) - 2, 760)
      const scale = width / base.width
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const vp = pg.getViewport({ scale: scale * dpr })
      const c = canvasRef.current
      c.width = vp.width; c.height = vp.height
      c.style.width = `${Math.round(vp.width / dpr)}px`; c.style.height = `${Math.round(vp.height / dpr)}px`
      const task = pg.render({ canvasContext: c.getContext('2d'), viewport: vp })
      taskRef.current = task
      try { await task.promise } catch (e) { if (e?.name !== 'RenderingCancelledException') console.error(e) }
    })()
    return () => { off = true }
  }, [doc, page])

  const total = doc?.numPages || 0
  const go = n => { const p = Math.max(1, Math.min(total, n)); setPage(p); setSeen(s => Math.max(s, p)) }
  const last = total > 0 && page === total
  const allSeen = total > 0 && seen >= total

  if (err) return <div style={{ color: '#c84b2f', fontSize: 13, padding: 12 }}>{err}</div>
  if (!doc) return <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div ref={boxRef} style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#085041', background: 'var(--accent-light)', borderRadius: 99, padding: '4px 10px' }}>
          Step {page} of {total}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{steps[page - 1] || title}</span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }} aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} style={{ width: 22, height: 4, borderRadius: 99, background: i + 1 <= seen ? 'var(--accent)' : 'var(--border)' }} />
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', justifyContent: 'center' }}>
        <canvas ref={canvasRef} aria-label={`${title}, page ${page} of ${total}`} style={{ display: 'block', maxWidth: '100%' }} />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-sm" onClick={() => go(page - 1)} disabled={page === 1}>← Back</button>
        {!last && <button className="btn btn-sm btn-primary" onClick={() => go(page + 1)} style={{ marginLeft: 'auto' }}>Next →</button>}
      </div>

      {last && allSeen && onConfirm && (
        <div style={{ border: '1px solid #9FE1CB', background: 'var(--accent-light)', borderRadius: 10, padding: 14, display: 'grid', gap: 10 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 0, cursor: 'pointer', fontSize: 14, color: '#085041' }}>
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} />
            <span>{confirmLabel}</span>
          </label>
          <div>
            <button className="btn btn-sm btn-primary" disabled={!agree || busy} onClick={onConfirm}>{busy ? 'Saving…' : 'Confirm'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
