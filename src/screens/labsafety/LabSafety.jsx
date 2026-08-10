import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { jsPDF } from 'jspdf'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

async function autoSaveToDocumentsTab(userId, certUrl, certName) {
  if (!userId || !certUrl) { console.warn('[autoSave] skipped — missing userId or certUrl', { userId, certUrl, certName }); return }
  try {
    const { data: rows, error: selErr } = await sb.from('training_fresh').select('id')
      .eq('user_id', userId).eq('certificate_name', certName).limit(1)
    if (selErr) { console.error('[autoSave] select error:', selErr); }
    const existing = rows?.[0]
    if (existing) {
      const { error: updErr } = await sb.from('training_fresh')
        .update({ certificate_url: certUrl, certificate_uploaded_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (updErr) console.error('[autoSave] update error:', updErr)
    } else {
      const { error: insErr } = await sb.from('training_fresh')
        .insert({ user_id: userId, certificate_url: certUrl, certificate_name: certName, certificate_uploaded_at: new Date().toISOString() })
      if (insErr) console.error('[autoSave] insert error:', insErr)
    }
  } catch (e) {
    console.error('[autoSave] unexpected error:', e)
  }
}

// ── Step configuration ─────────────────────────────────────────────────────
const STEPS = [
  {
    number: 1,
    title: 'Step 1',
    icon: '📋',
    description: 'Read ICT Safety Part I & receive certificate',
    type: 'pdf_safety',
    pdfConfig: {
      pdfPath: '/ict-safety-part1.pdf',
      slideCount: 46,
      displayTitle: 'ICT Health and Safety Program Part I',
      certTitle: 'ICT Health and Safety Program Part I — All ICT Users',
      certSubtitle: 'Covering RAMP Risk Assessment, PPE, Emergency Procedures & ICT Laboratory Policies',
      certSemester: 'ICT LABORATORY SAFETY PROGRAM  ·  FALL 2025',
      storagePrefix: 'safety-certs/part1/',
      stepNumber: 1,
      localKeyBase: 'ictlab_step1',
      autoUpdateOnMount: true,
    },
  },
  {
    number: 2,
    title: 'Step 2',
    icon: '📋',
    description: 'Read ICT Safety Part II & receive certificate',
    type: 'pdf_safety',
    pdfConfig: {
      pdfPath: '/ict-safety-part2.pdf',
      slideCount: 24,
      displayTitle: 'ICT Health and Safety Program Part II',
      certTitle: 'ICT Health and Safety Program Part II — Lab Users',
      certSubtitle: 'Covering Chemical Safety, Lab Policies, Equipment Use & Emergency Preparedness',
      certSemester: 'ICT LABORATORY SAFETY PROGRAM  ·  FALL 2025',
      storagePrefix: 'safety-certs/part2/',
      stepNumber: 2,
      localKeyBase: 'ictlab_step2',
      autoUpdateOnMount: false,
    },
  },
  {
    number: 3,
    title: 'Step 3',
    icon: '📝',
    description: 'Read Safety Rules, sign compliance form & complete online training',
    type: 'safety_rules',
  },
  {
    number: 4,
    title: 'Step 4',
    icon: '🎬',
    description: 'Watch the ICT Safety Training Video',
    type: 'ict_video',
    content: null,
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function UserAvatar({ user, size = 44 }) {
  const name = user.nick_name?.trim() || user.name || '?'
  const initial = name[0].toUpperCase()
  const colors = ['#534AB7', '#1D9E75', '#0369a1', '#92400e', '#c84b2f', '#065F46']
  const bg = colors[initial.charCodeAt(0) % colors.length]
  if (user.photo_url) {
    return <img src={user.photo_url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>
      {initial}
    </div>
  )
}

function StepDot({ number, completed }) {
  return (
    <div title={`Step ${number}: ${completed ? 'Approved' : 'Pending'}`} style={{
      width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: completed ? 13 : 11, fontWeight: 700,
      background: completed ? '#1D9E75' : 'var(--surface2)',
      color: completed ? '#fff' : '#9ca3af',
      border: `2px solid ${completed ? '#1D9E75' : 'var(--border)'}`,
      transition: 'all 0.2s',
    }}>
      {completed ? '✓' : number}
    </div>
  )
}

// ── User card (staff view) ─────────────────────────────────────────────────

function UserSafetyCard({ user, progress, selected, onClick }) {
  const userProg = progress[user.id] || {}
  const fullName = [user.nick_name?.trim() || user.name, user.last_name].filter(Boolean).join(' ')

  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? 'var(--accent-light)' : 'var(--surface)',
        border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 12, padding: '14px 12px', cursor: 'pointer', transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--accent)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <UserAvatar user={user} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {STEPS.map(s => <StepDot key={s.number} number={s.number} completed={!!userProg[s.number]?.completed} />)}
      </div>
    </div>
  )
}

// ── PDF Safety Training + Certificate (generic for Part I and Part II) ─────

function CompletionPopup({ onGenerate, onClose, generating, slideCount, partLabel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, padding: 32, maxWidth: 440, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center',
        border: '2px solid #1D9E75',
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
        <div style={{ fontWeight: 700, fontSize: 20, color: '#085041', marginBottom: 8 }}>{partLabel} Completed!</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 24 }}>
          You've successfully read through all {slideCount} slides of the<br />
          <strong>ICT Health and Safety Program {partLabel}</strong>.<br />
          Generate your certificate below — it will be submitted to your lab manager for approval.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onGenerate}
            disabled={generating}
            style={{
              padding: '12px 24px', background: '#1D9E75', color: '#fff', border: 'none',
              borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: generating ? 'default' : 'pointer',
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? '⏳ Generating certificate…' : '📜 Generate & Submit Certificate'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px', background: 'none', color: 'var(--text3)', border: '1px solid var(--border)',
              borderRadius: 10, fontSize: 14, cursor: 'pointer',
            }}
          >
            Review slides again
          </button>
        </div>
      </div>
    </div>
  )
}

function PDFSafetyContent({
  user, isManager, stepRow, onCertGenerated,
  pdfPath, slideCount, displayTitle, certTitle, certSubtitle, certSemester,
  storagePrefix, stepNumber, localKeyBase, autoUpdateOnMount,
}) {
  const { session } = useAppStore()

  const partLabel = stepNumber === 1 ? 'Part I' : stepNumber === 2 ? 'Part II' : `Step ${stepNumber}`

  const [pdfDoc, setPdfDoc] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loadingPDF, setLoadingPDF] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showCompletion, setShowCompletion] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)

  const storageKey = `${localKeyBase}_done_${user?.id}`
  const certV2Key  = `${localKeyBase}_v2_${user?.id}`
  const [hasReachedEnd, setHasReachedEnd] = useState(() => !!localStorage.getItem(storageKey))
  const [autoUpdating, setAutoUpdating]   = useState(false)

  const canvasRef        = useRef(null)
  const canvasWrapperRef = useRef(null)
  const renderTaskRef    = useRef(null)
  const containerRef     = useRef(null)
  const viewerBoxRef     = useRef(null)

  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFSChange)
    return () => document.removeEventListener('fullscreenchange', onFSChange)
  }, [])

  function toggleFullscreen() {
    if (!document.fullscreenElement) viewerBoxRef.current?.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  // Load PDF when viewer opens
  useEffect(() => {
    if (!viewerOpen || pdfDoc) return
    let cancelled = false
    async function init() {
      setLoadingPDF(true)
      setPdfError(null)
      try {
        const res = await fetch(pdfPath)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.arrayBuffer()
        const doc = await pdfjsLib.getDocument({ data }).promise
        if (cancelled) return
        setPdfDoc(doc)
        setTotalPages(doc.numPages)
      } catch (e) {
        console.error('PDF load error:', e)
        if (!cancelled) setPdfError('Failed to load the PDF. Please check your connection and try again.')
      }
      if (!cancelled) setLoadingPDF(false)
    }
    init()
    return () => { cancelled = true }
  }, [viewerOpen])

  // Re-render page whenever page, viewer state, or fullscreen state changes
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !viewerOpen) return
    let cancelled = false

    async function render() {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel() } catch {}
        renderTaskRef.current = null
      }
      setRendering(true)
      try {
        const page = await pdfDoc.getPage(currentPage)
        if (cancelled || !canvasRef.current) return

        // In fullscreen: fill the viewport (constrained by both width AND height)
        const containerEl = containerRef.current
        const containerW = containerEl?.clientWidth || (isFullscreen ? window.innerWidth : 680)
        const containerH = isFullscreen
          ? (containerEl?.clientHeight || window.innerHeight - 60) - 24  // subtract 12px padding top+bottom
          : Infinity

        const baseVP = page.getViewport({ scale: 1 })
        const scaleByW = (containerW - 24) / baseVP.width  // 12px padding each side
        const scaleByH = containerH < Infinity ? containerH / baseVP.height : Infinity
        const maxScale = isFullscreen ? 4 : 1.8
        const scale    = Math.min(scaleByW, scaleByH, maxScale)
        const viewport = page.getViewport({ scale })

        const canvas = canvasRef.current
        canvas.width  = viewport.width
        canvas.height = viewport.height

        const task = page.render({ canvasContext: canvas.getContext('2d'), viewport })
        renderTaskRef.current = task
        await task.promise
        renderTaskRef.current = null

        if (cancelled) return

        // Clickable link overlay
        const wrapper = canvasWrapperRef.current
        if (wrapper) {
          wrapper.querySelectorAll('.pdf-link').forEach(el => el.remove())
          const annotations = await page.getAnnotations()
          annotations
            .filter(a => a.subtype === 'Link' && a.url)
            .forEach(ann => {
              const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(ann.rect)
              const left = Math.min(x1, x2)
              const top  = Math.min(y1, y2)
              const w    = Math.abs(x2 - x1)
              const h    = Math.abs(y2 - y1)
              const a = document.createElement('a')
              a.className = 'pdf-link'
              a.href = ann.url
              a.target = '_blank'
              a.rel = 'noopener noreferrer'
              a.title = ann.url
              a.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;cursor:pointer;`
              wrapper.appendChild(a)
            })
        }
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') console.error(e)
      }
      if (!cancelled) setRendering(false)
    }
    render()
    return () => { cancelled = true }
  }, [pdfDoc, currentPage, viewerOpen, isFullscreen])

  function goToPage(n) {
    if (!pdfDoc || n < 1 || n > totalPages) return
    setCurrentPage(n)
    if (n === totalPages) {
      localStorage.setItem(storageKey, '1')
      setHasReachedEnd(true)
      setShowCompletion(true)
    }
  }

  // Auto-regenerate old-style certs to new design on first load (silent, no download)
  useEffect(() => {
    if (!autoUpdateOnMount) return
    if (!user?.id || !stepRow?.certificate_url || stepRow?.completed || isManager) return
    if (localStorage.getItem(certV2Key)) return
    generateCertificate({ autoUpdate: true })
  }, [])

  async function generateCertificate({ autoUpdate = false } = {}) {
    if (autoUpdate) setAutoUpdating(true)
    else setGenerating(true)
    setGenError(null)
    try {
      const firstName = user.nick_name?.trim() || user.name || ''
      const lastName  = user.last_name || ''
      const fullName  = [firstName, lastName].filter(Boolean).join(' ') || 'Student'
      const dateStr   = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

      // ICT logo as faint watermark
      let logoDataUrl = null
      try {
        const logoRes = await fetch('/ict-logo.png')
        if (logoRes.ok) {
          const logoBlob = await logoRes.blob()
          const logoObjUrl = URL.createObjectURL(logoBlob)
          const img = await new Promise(resolve => {
            const i = new Image()
            i.onload = () => resolve(i)
            i.onerror = () => resolve(null)
            i.src = logoObjUrl
          })
          if (img?.naturalWidth > 0) {
            const cvs = document.createElement('canvas')
            cvs.width = img.naturalWidth
            cvs.height = img.naturalHeight
            const ctx = cvs.getContext('2d')
            ctx.globalAlpha = 0.07
            ctx.drawImage(img, 0, 0)
            logoDataUrl = cvs.toDataURL('image/png')
          }
          URL.revokeObjectURL(logoObjUrl)
        }
      } catch {}

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth()   // 297
      const H = doc.internal.pageSize.getHeight()  // 210

      doc.setFillColor(255, 255, 255)
      doc.rect(0, 0, W, H, 'F')

      if (logoDataUrl) {
        const lSize = 90
        doc.addImage(logoDataUrl, 'PNG', W / 2 - lSize / 2, H / 2 - lSize / 2 + 8, lSize, lSize)
      }

      // Border
      doc.setDrawColor(29, 158, 117)
      doc.setLineWidth(3)
      doc.rect(8, 8, W - 16, H - 16)
      doc.setLineWidth(0.8)
      doc.rect(12, 12, W - 24, H - 24)

      // Corner circles
      doc.setFillColor(29, 158, 117)
      ;[[8,8],[W-8,8],[8,H-8],[W-8,H-8]].forEach(([cx, cy]) => doc.circle(cx, cy, 4, 'F'))

      // Header band
      doc.setFillColor(13, 71, 161)
      doc.rect(8, 8, W - 16, 32, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      doc.text('CERTIFICATE OF COMPLETION', W / 2, 22, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.text(certSemester, W / 2, 32, { align: 'center' })

      doc.setTextColor(80, 80, 80)
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(13)
      doc.text('This certifies that', W / 2, 60, { align: 'center' })

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(30)
      doc.setTextColor(29, 158, 117)
      doc.text(fullName, W / 2, 82, { align: 'center' })

      const nameW = doc.getTextWidth(fullName)
      doc.setDrawColor(29, 158, 117)
      doc.setLineWidth(0.6)
      doc.line(W / 2 - nameW / 2 - 8, 86, W / 2 + nameW / 2 + 8, 86)

      doc.setFont('helvetica', 'italic')
      doc.setFontSize(13)
      doc.setTextColor(80, 80, 80)
      doc.text('has successfully completed', W / 2, 98, { align: 'center' })

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(20, 20, 20)
      doc.text(certTitle, W / 2, 110, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(100, 100, 100)
      doc.text(certSubtitle, W / 2, 119, { align: 'center' })

      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(60, 60, 60)
      doc.text(`Date of Completion:  ${dateStr}`, W / 2, 142, { align: 'center' })

      // Footer band
      doc.setFillColor(29, 158, 117)
      doc.rect(8, H - 22, W - 16, 14, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text('ICT Laboratory · College of Engineering · University of Missouri', W / 2, H - 13, { align: 'center' })

      // Upload to Supabase
      const blob = doc.output('blob')
      const fileName = `${storagePrefix}${user.id}-${Date.now()}.pdf`
      const { error: upErr } = await sb.storage
        .from('project-files')
        .upload(fileName, blob, { contentType: 'application/pdf', upsert: false })

      let certUrl = null
      if (!upErr) {
        const { data: urlData } = sb.storage.from('project-files').getPublicUrl(fileName)
        certUrl = urlData?.publicUrl
      }

      await sb.from('lab_safety_progress').upsert({
        user_id: user.id,
        organization_id: session.organizationId,
        step_number: stepNumber,
        completed: false,
        certificate_url: certUrl,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'user_id,step_number' })

      await autoSaveToDocumentsTab(user.id, certUrl, certTitle)

      if (!autoUpdate) doc.save(`ICT-Safety-${partLabel.replace(/\s+/g, '-')}-${fullName.replace(/\s+/g, '-')}.pdf`)
      if (autoUpdate) localStorage.setItem(certV2Key, '1')
      setShowCompletion(false)
      onCertGenerated({ certificate_url: certUrl, submitted_at: new Date().toISOString() })
    } catch (e) {
      console.error('Certificate error:', e)
      if (!autoUpdate) setGenError('Failed to submit certificate. Please try again.')
    }
    if (autoUpdate) setAutoUpdating(false)
    else setGenerating(false)
  }

  const hasCert    = !!stepRow?.certificate_url
  const isApproved = !!stepRow?.completed

  // ── Manager view ──
  if (isManager) {
    return (
      <div>
        <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          Lab users must read the <strong>{displayTitle}</strong> presentation ({slideCount} slides).
          Upon completing the last slide, they generate a certificate which is submitted here for your approval.
        </div>
        {hasCert ? (
          <div style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 10, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#085041', marginBottom: 4 }}>
                {isApproved ? '✓ Certificate approved' : '📜 Certificate submitted — awaiting your approval'}
              </div>
              {stepRow?.submitted_at && (
                <div style={{ fontSize: 12, color: '#085041' }}>
                  Submitted: {new Date(stepRow.submitted_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              )}
            </div>
            <a
              href={stepRow.certificate_url}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#1D9E75', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              View Certificate ↗
            </a>
          </div>
        ) : (
          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, border: '2px dashed var(--border)', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No certificate submitted yet. The lab user must complete the training presentation first.
          </div>
        )}
      </div>
    )
  }

  // ── Lab user view ──
  return (
    <div>
      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
        Read all <strong>{slideCount} slides</strong> of the <strong>{displayTitle}</strong>.
        When you reach the last slide, a certificate will be generated for your lab manager to approve.
      </div>

      {hasCert && (
        <div style={{ background: isApproved ? '#E1F5EE' : '#f0fdf4', border: `1px solid ${isApproved ? '#9FE1CB' : '#bbf7d0'}`, borderRadius: 10, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#085041', marginBottom: 4 }}>
              {isApproved ? `✓ Step ${stepNumber} approved by your lab manager!` : '✓ Certificate submitted — awaiting lab manager approval'}
            </div>
            {stepRow?.submitted_at && (
              <div style={{ fontSize: 12, color: '#085041' }}>
                Submitted: {new Date(stepRow.submitted_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            )}
          </div>
          {autoUpdating ? (
            <span style={{ fontSize: 13, color: '#085041', fontStyle: 'italic' }}>⏳ Updating certificate…</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <a
                href={stepRow.certificate_url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#1D9E75', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                View Certificate ↗
              </a>
              <span style={{ fontSize: 11, color: '#085041', opacity: 0.8 }}>Also saved in Training Records → Documents tab</span>
            </div>
          )}
        </div>
      )}

      {genError && (
        <div style={{ marginBottom: 12, fontSize: 13, color: '#c84b2f', background: '#fef2f2', borderRadius: 6, padding: '8px 12px' }}>
          {genError}
        </div>
      )}

      {!viewerOpen ? (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setViewerOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 22px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 20 }}>📖</span>
            {hasCert ? `Review Training Material Again` : hasReachedEnd ? 'Review Training Material' : `Open Safety Training — ${partLabel} (${slideCount} slides)`}
          </button>
          {hasReachedEnd && !hasCert && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#085041', fontWeight: 600 }}>
              ✓ You've reached the last slide. Generate your certificate below.
            </div>
          )}
        </div>
      ) : (
        <div
          ref={viewerBoxRef}
          style={{
            border: '1px solid var(--border)',
            borderRadius: isFullscreen ? 0 : 12,
            overflow: 'hidden',
            marginBottom: 12,
            display: 'flex',
            flexDirection: 'column',
            background: '#525659',
            // When fullscreen, the element fills the viewport — let it be 100% of the fullscreen area
            ...(isFullscreen ? { width: '100%', height: '100%' } : {}),
          }}
        >
          {/* PDF canvas area */}
          <div
            ref={containerRef}
            style={{
              background: '#525659',
              padding: 12,
              minHeight: 200,
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              alignItems: isFullscreen ? 'center' : 'flex-start',
              flex: 1,
              overflow: isFullscreen ? 'hidden' : 'visible',
            }}
          >
            {loadingPDF && (
              <div style={{ color: '#fff', textAlign: 'center', padding: 40, fontSize: 14 }}>
                Loading PDF… please wait
              </div>
            )}
            {pdfError && (
              <div style={{ color: '#fca5a5', textAlign: 'center', padding: 40, fontSize: 14 }}>
                {pdfError}
              </div>
            )}
            <div
              ref={canvasWrapperRef}
              style={{ position: 'relative', display: pdfDoc ? 'block' : 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', borderRadius: 2 }}
            >
              <canvas ref={canvasRef} style={{ display: 'block' }} />
            </div>
            {rendering && (
              <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                Loading…
              </div>
            )}
          </div>

          {/* Navigation bar */}
          {pdfDoc && (
            <div style={{ background: isFullscreen ? '#1a1a1a' : 'var(--surface2)', borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: currentPage <= 1 ? 'default' : 'pointer', opacity: currentPage <= 1 ? 0.4 : 1, fontFamily: 'var(--sans)' }}
              >
                ← Prev
              </button>

              <div style={{ flex: 1 }}>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 4 }}>
                  <div style={{ width: `${(currentPage / totalPages) * 100}%`, height: '100%', background: '#1D9E75', borderRadius: 2, transition: 'width 0.2s' }} />
                </div>
                <div style={{ textAlign: 'center', fontSize: 12, color: isFullscreen ? '#ccc' : 'var(--text3)', fontWeight: 600 }}>
                  Slide {currentPage} / {totalPages}
                </div>
              </div>

              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: currentPage < totalPages ? '#1D9E75' : 'var(--surface)', color: currentPage < totalPages ? '#fff' : 'var(--text)', fontSize: 13, fontWeight: 600, cursor: currentPage >= totalPages ? 'default' : 'pointer', opacity: currentPage >= totalPages ? 0.4 : 1, fontFamily: 'var(--sans)' }}
              >
                Next →
              </button>

              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 15, cursor: 'pointer', lineHeight: 1, fontFamily: 'var(--sans)' }}
              >
                {isFullscreen ? '⤡' : '⤢'}
              </button>
            </div>
          )}

          {!isFullscreen && (
            <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '8px 16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setViewerOpen(false)}
                style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', padding: '4px 8px' }}
              >
                Close viewer
              </button>
            </div>
          )}
        </div>
      )}

      {hasReachedEnd && !hasCert && (
        <div style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 10, padding: 16, marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#085041', marginBottom: 8 }}>
            ✅ You've read all {slideCount} slides!
          </div>
          <div style={{ fontSize: 13, color: '#085041', marginBottom: 12, lineHeight: 1.6 }}>
            Your completion certificate is ready. Click below to generate it and submit to your lab manager.
          </div>
          <button
            onClick={generateCertificate}
            disabled={generating}
            style={{ padding: '10px 22px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.7 : 1 }}
          >
            {generating ? '⏳ Generating…' : '📜 Generate & Submit Certificate'}
          </button>
        </div>
      )}

      {showCompletion && (
        <CompletionPopup
          generating={generating}
          onGenerate={generateCertificate}
          onClose={() => setShowCompletion(false)}
          slideCount={slideCount}
          partLabel={partLabel}
        />
      )}
    </div>
  )
}

// ── Reusable PDF viewer (no cert generation) ──────────────────────────────

function SimplePDFViewer({ pdfPath, localKey, onLastPage, maxPages }) {
  const [pdfDoc, setPdfDoc]       = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages]   = useState(0)
  const [loading, setLoading]     = useState(false)
  const [pdfError, setPdfError]   = useState(null)
  const [open, setOpen]           = useState(false)
  const [rendering, setRendering] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [done, setDone] = useState(() => !!localStorage.getItem(localKey))

  const canvasRef    = useRef(null)
  const wrapperRef   = useRef(null)
  const renderRef    = useRef(null)
  const containerRef = useRef(null)
  const viewerRef    = useRef(null)

  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  useEffect(() => {
    if (!open || pdfDoc) return
    let cancelled = false
    async function init() {
      setLoading(true)
      setPdfError(null)
      try {
        const res = await fetch(pdfPath)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.arrayBuffer()
        const doc = await pdfjsLib.getDocument({ data }).promise
        if (!cancelled) { setPdfDoc(doc); setTotalPages(doc.numPages) }
      } catch (e) {
        if (!cancelled) setPdfError('Failed to load PDF. Please check your connection and try again.')
      }
      if (!cancelled) setLoading(false)
    }
    init()
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !open) return
    let cancelled = false
    async function render() {
      if (renderRef.current) { try { renderRef.current.cancel() } catch {} renderRef.current = null }
      setRendering(true)
      try {
        const page = await pdfDoc.getPage(currentPage)
        if (cancelled || !canvasRef.current) return
        const containerW = containerRef.current?.clientWidth || (isFullscreen ? window.innerWidth : 680)
        const containerH = isFullscreen ? (containerRef.current?.clientHeight || window.innerHeight - 60) - 24 : Infinity
        const baseVP = page.getViewport({ scale: 1 })
        const scaleByW = (containerW - 24) / baseVP.width
        const scaleByH = containerH < Infinity ? containerH / baseVP.height : Infinity
        const scale    = Math.min(scaleByW, scaleByH, isFullscreen ? 4 : 1.8)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        canvas.width  = viewport.width
        canvas.height = viewport.height
        const task = page.render({ canvasContext: canvas.getContext('2d'), viewport })
        renderRef.current = task
        await task.promise
        renderRef.current = null
        if (cancelled) return
        // Clickable links
        if (wrapperRef.current) {
          wrapperRef.current.querySelectorAll('.pdf-link').forEach(el => el.remove())
          const anns = await page.getAnnotations()
          anns.filter(a => a.subtype === 'Link' && a.url).forEach(ann => {
            const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(ann.rect)
            const a = document.createElement('a')
            a.className = 'pdf-link'
            a.href = ann.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = ann.url
            a.style.cssText = `position:absolute;left:${Math.min(x1,x2)}px;top:${Math.min(y1,y2)}px;width:${Math.abs(x2-x1)}px;height:${Math.abs(y2-y1)}px;cursor:pointer;`
            wrapperRef.current.appendChild(a)
          })
        }
      } catch (e) { if (e?.name !== 'RenderingCancelledException') console.error(e) }
      if (!cancelled) setRendering(false)
    }
    render()
    return () => { cancelled = true }
  }, [pdfDoc, currentPage, open, isFullscreen])

  const effectiveLast = maxPages ? Math.min(totalPages, maxPages) : totalPages

  function goToPage(n) {
    if (!pdfDoc || n < 1 || n > effectiveLast) return
    setCurrentPage(n)
    if (n === effectiveLast && !done) {
      localStorage.setItem(localKey, '1')
      setDone(true)
      onLastPage?.()
    }
  }

  return (
    <div>
      {done && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 8, padding: '6px 14px', marginBottom: 10, fontSize: 13, fontWeight: 600, color: '#085041' }}>
          ✓ Document read in full
        </div>
      )}
      {!open ? (
        <div>
          <button
            onClick={() => setOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 18 }}>📄</span>
            {done ? 'Review Document Again' : `Open Safety Rules PDF (${maxPages || totalPages || 5} pages)`}
          </button>
        </div>
      ) : (
        <div ref={viewerRef} style={{ border: '1px solid var(--border)', borderRadius: isFullscreen ? 0 : 10, overflow: 'hidden', marginTop: 10, display: 'flex', flexDirection: 'column', background: '#525659', ...(isFullscreen ? { width: '100%', height: '100%' } : {}) }}>
          <div ref={containerRef} style={{ background: '#525659', padding: 12, minHeight: 180, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: isFullscreen ? 'center' : 'flex-start', flex: 1, overflow: isFullscreen ? 'hidden' : 'visible' }}>
            {loading && <div style={{ color: '#fff', padding: 40, fontSize: 14 }}>Loading PDF… please wait</div>}
            {pdfError && <div style={{ color: '#fca5a5', padding: 40, fontSize: 14 }}>{pdfError}</div>}
            <div ref={wrapperRef} style={{ position: 'relative', display: pdfDoc ? 'block' : 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', borderRadius: 2 }}>
              <canvas ref={canvasRef} style={{ display: 'block' }} />
            </div>
            {rendering && <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>Loading…</div>}
          </div>
          {pdfDoc && (
            <div style={{ background: isFullscreen ? '#1a1a1a' : 'var(--surface2)', borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}
                style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: currentPage <= 1 ? 'default' : 'pointer', opacity: currentPage <= 1 ? 0.4 : 1, fontFamily: 'var(--sans)' }}>
                ← Prev
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 4 }}>
                  <div style={{ width: `${(currentPage / effectiveLast) * 100}%`, height: '100%', background: '#1D9E75', borderRadius: 2, transition: 'width 0.2s' }} />
                </div>
                <div style={{ textAlign: 'center', fontSize: 12, color: isFullscreen ? '#ccc' : 'var(--text3)', fontWeight: 600 }}>Page {currentPage} / {effectiveLast}</div>
              </div>
              <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= effectiveLast}
                style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: currentPage < effectiveLast ? '#1D9E75' : 'var(--surface)', color: currentPage < effectiveLast ? '#fff' : 'var(--text)', fontSize: 13, fontWeight: 600, cursor: currentPage >= effectiveLast ? 'default' : 'pointer', opacity: currentPage >= effectiveLast ? 0.4 : 1, fontFamily: 'var(--sans)' }}>
                Next →
              </button>
              <button onClick={() => { if (!document.fullscreenElement) viewerRef.current?.requestFullscreen?.(); else document.exitFullscreen?.() }}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 15, cursor: 'pointer', lineHeight: 1, fontFamily: 'var(--sans)' }}>
                {isFullscreen ? '⤡' : '⤢'}
              </button>
            </div>
          )}
          {!isFullscreen && (
            <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '8px 16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)} style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', padding: '4px 8px' }}>
                Close viewer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 3: Safety Rules + Compliance Form + External Training ─────────────

function Step3PolicyContent({ user, isManager, stepRow, onCertGenerated }) {
  const { session } = useAppStore()

  // Parse saved URLs from DB (stored as JSON in certificate_url)
  const savedUrls = (() => { try { return JSON.parse(stepRow?.certificate_url || '{}') } catch { return {} } })()

  // Form state
  const [formData, setFormData] = useState({
    firstName: user?.nick_name?.trim() || user?.name || '',
    lastName:  user?.last_name || '',
    email:     user?.email || '',
    piFirst:   '',
    piLast:    '',
  })
  const [formUrl, setFormUrl]         = useState(savedUrls.form || null)
  const [generatingForm, setGeneratingForm] = useState(false)
  const [formError, setFormError]     = useState(null)

  // External cert uploads
  const [ext1Url, setExt1Url]   = useState(savedUrls.ext1 || null)
  const [ext2Url, setExt2Url]   = useState(savedUrls.ext2 || null)
  const [uploading1, setUploading1] = useState(false)
  const [uploading2, setUploading2] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const ext1InputRef = useRef(null)
  const ext2InputRef = useRef(null)

  async function saveProgress(updates) {
    const urls = { form: formUrl, ext1: ext1Url, ext2: ext2Url, ...updates }
    const allDone = !!urls.form && !!urls.ext1 && !!urls.ext2
    const submittedAt = allDone ? (stepRow?.submitted_at || new Date().toISOString()) : (stepRow?.submitted_at || null)
    const payload = {
      user_id: user.id,
      organization_id: session.organizationId,
      step_number: 3,
      completed: false,
      certificate_url: JSON.stringify(urls),
      submitted_at: submittedAt,
    }
    await sb.from('lab_safety_progress').upsert(payload, { onConflict: 'user_id,step_number' })
    onCertGenerated({ certificate_url: JSON.stringify(urls), submitted_at: submittedAt })
  }

  async function generateComplianceForm() {
    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.email.trim() || !formData.piLast.trim() || !formData.piFirst.trim()) {
      setFormError('Please fill in all fields before generating the form.')
      return
    }
    setGeneratingForm(true)
    setFormError(null)
    try {
      // ICT logo watermark
      let logoDataUrl = null
      try {
        const res = await fetch('/ict-logo.png')
        if (res.ok) {
          const blob = await res.blob()
          const objUrl = URL.createObjectURL(blob)
          const img = await new Promise(resolve => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = objUrl })
          if (img?.naturalWidth > 0) {
            const cvs = document.createElement('canvas'); cvs.width = img.naturalWidth; cvs.height = img.naturalHeight
            const ctx = cvs.getContext('2d'); ctx.globalAlpha = 0.07; ctx.drawImage(img, 0, 0)
            logoDataUrl = cvs.toDataURL('image/png')
          }
          URL.revokeObjectURL(objUrl)
        }
      } catch {}

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = 210, H = 297

      doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, H, 'F')
      if (logoDataUrl) { const s = 120; doc.addImage(logoDataUrl, 'PNG', W/2 - s/2, H/2 - s/2 + 20, s, s) }

      // Border
      doc.setDrawColor(29, 158, 117); doc.setLineWidth(2); doc.rect(8, 8, W - 16, H - 16)
      doc.setLineWidth(0.5); doc.rect(11, 11, W - 22, H - 22)
      doc.setFillColor(29, 158, 117)
      ;[[8,8],[W-8,8],[8,H-8],[W-8,H-8]].forEach(([cx, cy]) => doc.circle(cx, cy, 3, 'F'))

      // Header band
      doc.setFillColor(13, 71, 161); doc.rect(8, 8, W - 16, 28, 'F')
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
      doc.text('Civil and Environmental Engineering ICT Laboratory', W/2, 19, { align: 'center' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      doc.text('Safety Rules — COMPLIANCE FORM', W/2, 29, { align: 'center' })

      // Body text
      doc.setTextColor(50, 50, 50); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      const body = 'I have read, understood, and will comply with the rules outlined in the Civil and Environmental Engineering ICT Laboratory Safety Rules. I will take full responsibility for any action that may happen while using the ICT Laboratories.'
      doc.text(body, 20, 50, { maxWidth: W - 40 })

      // STUDENT section
      let y = 82
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 20, 20)
      doc.text('STUDENT:', 20, y); y += 14

      const lineColor = [29, 158, 117]
      doc.setDrawColor(...lineColor); doc.setLineWidth(0.4)

      // Last / First name row
      doc.line(20, y, 95, y); doc.line(105, y, 190, y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(20, 20, 20)
      doc.text(formData.lastName, 20, y - 2)
      doc.text(formData.firstName, 105, y - 2)
      doc.setFontSize(7); doc.setTextColor(120, 120, 120)
      doc.text('Last Name (print)', 20, y + 4)
      doc.text('First Name (print)', 105, y + 4)
      y += 18

      // Signature / Date row
      doc.setDrawColor(...lineColor)
      doc.line(20, y, 95, y); doc.line(105, y, 190, y)
      doc.setFont('helvetica', 'italic'); doc.setFontSize(11); doc.setTextColor(20, 20, 20)
      doc.text(`${formData.firstName} ${formData.lastName}`, 20, y - 2)
      doc.setFont('helvetica', 'normal')
      doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 105, y - 2)
      doc.setFontSize(7); doc.setTextColor(120, 120, 120)
      doc.text('Signature (Electronic)', 20, y + 4)
      doc.text('Date Signed', 105, y + 4)
      y += 18

      // Email row
      doc.setDrawColor(...lineColor); doc.line(20, y, 130, y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(20, 20, 20)
      doc.text(formData.email, 20, y - 2)
      doc.setFontSize(7); doc.setTextColor(120, 120, 120)
      doc.text('UIUC Email address', 20, y + 4)
      y += 24

      // PI section
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 20, 20)
      doc.text('PRINCIPAL INVESTIGATOR:', 20, y); y += 14

      doc.setDrawColor(...lineColor)
      doc.line(20, y, 95, y); doc.line(105, y, 190, y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(20, 20, 20)
      doc.text(formData.piLast, 20, y - 2)
      doc.text(formData.piFirst, 105, y - 2)
      doc.setFontSize(7); doc.setTextColor(120, 120, 120)
      doc.text('Last Name (print)', 20, y + 4)
      doc.text('First Name (print)', 105, y + 4)

      // Footer
      doc.setFillColor(29, 158, 117); doc.rect(8, H - 20, W - 16, 12, 'F')
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      doc.text('ICT Laboratory · College of Engineering · University of Illinois Urbana-Champaign', W/2, H - 12, { align: 'center' })

      const blob = doc.output('blob')
      const fileName = `safety-certs/step3/${user.id}-compliance-${Date.now()}.pdf`
      const { error: upErr } = await sb.storage.from('project-files').upload(fileName, blob, { contentType: 'application/pdf', upsert: false })
      if (upErr) throw upErr

      const { data: urlData } = sb.storage.from('project-files').getPublicUrl(fileName)
      const url = urlData?.publicUrl
      setFormUrl(url)
      await saveProgress({ form: url })
      await autoSaveToDocumentsTab(user.id, url, 'ICT Safety Rules — Compliance Form (Appendix D)')
    } catch (e) {
      console.error('Compliance form error:', e)
      setFormError('Failed to generate or upload the form. Please try again.')
    }
    setGeneratingForm(false)
  }

  async function uploadExtCert(part, file) {
    if (!file) return
    setUploadError(null)
    const setter = part === 1 ? setUploading1 : setUploading2
    setter(true)
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      const fileName = `safety-certs/step3/${user.id}-ext${part}-${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from('project-files').upload(fileName, file, { contentType: file.type, upsert: false })
      if (upErr) throw upErr
      const { data: urlData } = sb.storage.from('project-files').getPublicUrl(fileName)
      const url = urlData?.publicUrl
      if (part === 1) { setExt1Url(url); await saveProgress({ ext1: url }); await autoSaveToDocumentsTab(user.id, url, 'DRS Online Training — Part 1 Certificate') }
      else            { setExt2Url(url); await saveProgress({ ext2: url }); await autoSaveToDocumentsTab(user.id, url, 'DRS Online Training — Part 2 Certificate') }
    } catch (e) {
      console.error('Upload error:', e)
      setUploadError(`Failed to upload Part ${part} certificate. Please try again.`)
    }
    setter(false)
  }

  // ── Manager view ──
  if (isManager) {
    const urls = (() => { try { return JSON.parse(stepRow?.certificate_url || '{}') } catch { return {} } })()
    const hasForm = !!urls.form
    const hasExt1 = !!urls.ext1
    const hasExt2 = !!urls.ext2
    const hasAny  = hasForm || hasExt1 || hasExt2
    return (
      <div>
        <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          Lab users must: (1) read the <strong>ICT Safety Rules 2026</strong> document, (2) digitally sign and submit the <strong>compliance form</strong> (Appendix D), and (3) complete two online DRS training modules and upload their completion certificates.
        </div>
        {!hasAny ? (
          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, border: '2px dashed var(--border)', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No documents submitted yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Compliance Form (Appendix D)', url: urls.form, done: hasForm },
              { label: 'DRS Online Training Part 1 Certificate', url: urls.ext1, done: hasExt1 },
              { label: 'DRS Online Training Part 2 Certificate', url: urls.ext2, done: hasExt2 },
            ].map(({ label, url, done }, i) => (
              <div key={i} style={{ background: done ? '#E1F5EE' : 'var(--surface2)', border: `1px solid ${done ? '#9FE1CB' : 'var(--border)'}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: done ? '#085041' : 'var(--text3)' }}>
                  {done ? '✓' : '⏳'} {label}
                </div>
                {done && (
                  <a href={url} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#1D9E75', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    View ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Lab user view ──
  const isSubmitted = !!stepRow?.submitted_at
  const allDone = !!formUrl && !!ext1Url && !!ext2Url

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Submitted banner */}
      {isSubmitted && (
        <div style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#085041', lineHeight: 1.7 }}>
          <span style={{ fontWeight: 700 }}>✓ All Step 3 documents submitted — awaiting lab manager approval.</span><br />
          All certificates have been saved to your <strong>Training Records → Documents tab</strong>.
        </div>
      )}

      {/* ── Card 1: Read Safety Rules PDF ── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E1F5EE', border: '2px solid #1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#1D9E75', flexShrink: 0 }}>1</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Read the ICT Safety Rules Document</div>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 12 }}>
            Read all 6 pages of the <strong>ICT Safety Rules in Laboratories — 2026</strong>, including General Safety Rules, PPE requirements (Appendix A), Electrical Rules (Appendix B), and the Compliance Form template (Appendix D).
          </div>
          <SimplePDFViewer
            pdfPath="/ict-safety-rules.pdf"
            localKey={`ictlab_step3_read_${user?.id}`}
            onLastPage={() => {}}
            maxPages={5}
          />
        </div>
      </div>

      {/* ── Card 2: Compliance Form ── */}
      <div style={{ border: `1px solid ${formUrl ? '#9FE1CB' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: formUrl ? '#E1F5EE' : 'var(--surface2)', borderBottom: `1px solid ${formUrl ? '#9FE1CB' : 'var(--border)'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: formUrl ? '#1D9E75' : '#E1F5EE', border: `2px solid ${formUrl ? '#1D9E75' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: formUrl ? '#fff' : '#9ca3af', flexShrink: 0 }}>
            {formUrl ? '✓' : '2'}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: formUrl ? '#085041' : 'var(--text)' }}>Sign the Compliance Form (Appendix D)</div>
          {formUrl && (
            <a href={formUrl} target="_blank" rel="noreferrer"
              style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#1D9E75', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              View Form ↗
            </a>
          )}
        </div>
        <div style={{ padding: 16 }}>
          {!formUrl ? (
            <>
              <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '12px 14px', marginBottom: 14, fontSize: 13, color: '#1e293b', lineHeight: 1.8 }}>
                <span style={{ fontWeight: 700 }}>Compliance Statement (Appendix D):</span><br />
                "I have read, understood, and will comply with the rules outlined in the Civil and Environmental Engineering ICT Laboratory Safety Rules. I will take full responsibility for any action that may happen while using the ICT Laboratories."
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 14 }}>
                Fill in your details below. Your typed name serves as your electronic signature. This generates a signed PDF version of Appendix D and submits it to your lab manager.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {[
                  { key: 'firstName', label: 'First Name*' },
                  { key: 'lastName',  label: 'Last Name*' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
                    <input
                      value={formData[key]}
                      onChange={e => setFormData(p => ({ ...p, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--sans)', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>UIUC Email Address*</div>
                <input
                  value={formData.email}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                  type="email"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--sans)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Principal Investigator</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                {[
                  { key: 'piFirst', label: 'PI First Name*' },
                  { key: 'piLast',  label: 'PI Last Name*' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
                    <input
                      value={formData[key]}
                      onChange={e => setFormData(p => ({ ...p, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--sans)', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
              </div>
              {formError && <div style={{ fontSize: 13, color: '#c84b2f', background: '#fef2f2', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>{formError}</div>}
              <button
                onClick={generateComplianceForm}
                disabled={generatingForm}
                style={{ padding: '10px 22px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: generatingForm ? 'default' : 'pointer', opacity: generatingForm ? 0.7 : 1 }}
              >
                {generatingForm ? '⏳ Generating…' : '📋 Generate & Submit Compliance Form'}
              </button>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#085041', lineHeight: 1.7 }}>
              Your signed compliance form has been submitted and saved to your <strong>Documents tab</strong>. Click <strong>View Form ↗</strong> above to download a copy.
            </div>
          )}
        </div>
      </div>

      {/* ── Card 3: External Training ── */}
      <div style={{ border: `1px solid ${(ext1Url && ext2Url) ? '#9FE1CB' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: (ext1Url && ext2Url) ? '#E1F5EE' : 'var(--surface2)', borderBottom: `1px solid ${(ext1Url && ext2Url) ? '#9FE1CB' : 'var(--border)'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: (ext1Url && ext2Url) ? '#1D9E75' : '#E1F5EE', border: `2px solid ${(ext1Url && ext2Url) ? '#1D9E75' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: (ext1Url && ext2Url) ? '#fff' : '#9ca3af', flexShrink: 0 }}>
            {(ext1Url && ext2Url) ? '✓' : '3'}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: (ext1Url && ext2Url) ? '#085041' : 'var(--text)' }}>Complete DRS Online Safety Training</div>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 14 }}>
            Complete both online training modules from the Division of Research Safety (DRS). After completing each module, download your certificate and upload it below — it will be automatically saved to your <strong>Documents tab</strong>.
          </div>
          {uploadError && <div style={{ fontSize: 13, color: '#c84b2f', background: '#fef2f2', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>{uploadError}</div>}

          {/* Part 1 */}
          {[
            {
              part: 1,
              label: 'DRS Training Part 1',
              url: 'https://storyline.research.illinois.edu/263/story.html',
              certUrl: ext1Url,
              uploading: uploading1,
              inputRef: ext1InputRef,
            },
            {
              part: 2,
              label: 'DRS Training Part 2',
              url: 'https://storyline.research.illinois.edu/264/story.html',
              certUrl: ext2Url,
              uploading: uploading2,
              inputRef: ext2InputRef,
            },
          ].map(({ part, label, url, certUrl, uploading, inputRef }) => (
            <div key={part} style={{ background: certUrl ? '#E1F5EE' : 'var(--surface2)', border: `1px solid ${certUrl ? '#9FE1CB' : 'var(--border)'}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: certUrl ? 0 : 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: certUrl ? '#085041' : 'var(--text)' }}>
                  {certUrl ? '✓ ' : ''}{label}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <a href={url} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#1D9E75', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                    Open Training ↗
                  </a>
                  {certUrl && (
                    <a href={certUrl} target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, fontWeight: 600, color: '#1D9E75', textDecoration: 'none' }}>
                      View Certificate ↗
                    </a>
                  )}
                </div>
              </div>
              {!certUrl && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                    After completing the module, upload your completion certificate (PDF or image):
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadExtCert(part, f) }}
                  />
                  <button
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    style={{ padding: '8px 18px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1, fontFamily: 'var(--sans)' }}
                  >
                    {uploading ? '⏳ Uploading…' : '⬆ Upload Certificate'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Progress summary */}
      {!isSubmitted && (
        <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', paddingBottom: 4 }}>
          {[!!formUrl, !!ext1Url, !!ext2Url].filter(Boolean).length} / 3 items submitted
          {allDone ? ' — step will be marked as submitted' : ''}
        </div>
      )}
    </div>
  )
}

// ── Step 4: ICT Safety Video ───────────────────────────────────────────────

const VIDEO_SRC = `${import.meta.env.BASE_URL}ict-safety-video.mp4`

function Step4VideoContent({ user, isManager }) {
  const userId     = user?.id
  const watchedKey = `ictlab_safety4_watched_${userId}`
  const confirmKey = `ictlab_safety4_confirmed_${userId}`
  const [videoWatched, setVideoWatched] = useState(() => !!localStorage.getItem(watchedKey))
  const [confirmed, setConfirmed]       = useState(false)
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    if (!userId) return
    sb.from('lab_safety_progress').select('completed').eq('user_id', userId).eq('step_number', 4).maybeSingle()
      .then(({ data }) => {
        if (data?.completed) {
          setVideoWatched(true)
          setConfirmed(true)
        }
      })
  }, [userId])

  function handleVideoEnded() {
    localStorage.setItem(watchedKey, '1')
    setVideoWatched(true)
  }

  async function handleConfirm(e) {
    if (saving) return
    const checked = e.target.checked
    setConfirmed(checked)
    if (!checked) return
    setSaving(true)
    const orgId = user?.organizationId || null
    await sb.from('lab_safety_progress').upsert({
      user_id: userId,
      step_number: 4,
      completed: true,
      submitted_at: new Date().toISOString(),
      organization_id: orgId,
    }, { onConflict: 'user_id,step_number' })
    if (orgId && userId) {
      const { data: managers } = await sb.from('users').select('id')
        .eq('organization_id', orgId).in('role', ['user', 'admin']).eq('is_active', true).neq('id', userId)
      if (managers?.length) {
        const name = user?.username || 'A lab user'
        await sb.from('notifications').insert(managers.map(m => ({
          user_id: m.id,
          message: `${name} has confirmed watching the ICT safety video (Step 4). Please review and approve.`,
          type: 'safety_step_submitted',
          read: false,
        })))
      }
    }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 12 }}>
          Watch the ICT Building Safety Video below. The confirmation checkbox will unlock once you have watched the entire video.
        </div>
        <video
          src={VIDEO_SRC}
          controls
          controlsList="nodownload"
          onContextMenu={e => e.preventDefault()}
          onEnded={handleVideoEnded}
          style={{ width: '100%', borderRadius: 8, background: '#000', display: 'block', maxHeight: 480 }}
        />
        {!videoWatched && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', textAlign: 'center' }}>
            Watch the full video to unlock the confirmation below.
          </div>
        )}
      </div>

      {!isManager && (
        <div style={{
          background: confirmed ? '#E1F5EE' : videoWatched ? 'var(--surface2)' : '#f5f5f5',
          border: `1px solid ${confirmed ? '#9FE1CB' : 'var(--border)'}`,
          borderRadius: 8, padding: '12px 16px', transition: 'all 0.2s',
          opacity: videoWatched ? 1 : 0.5,
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: videoWatched ? 'pointer' : 'not-allowed', fontSize: 14, color: confirmed ? '#085041' : 'var(--text)', fontWeight: confirmed ? 600 : 400 }}>
            <input type="checkbox" checked={confirmed} onChange={videoWatched ? handleConfirm : undefined} disabled={!videoWatched || saving}
              style={{ width: 16, height: 16, accentColor: '#1D9E75', cursor: videoWatched ? 'pointer' : 'not-allowed' }} />
            {saving ? 'Saving…' : 'I confirm I have watched the ICT Building Safety Video in full'}
          </label>
        </div>
      )}
    </div>
  )
}

// ── Step content renderer ──────────────────────────────────────────────────

function StepContentArea({ step, user, isManager, stepRow, onCertGenerated }) {
  if (step.type === 'pdf_safety') {
    return (
      <PDFSafetyContent
        user={user}
        isManager={isManager}
        stepRow={stepRow}
        onCertGenerated={onCertGenerated}
        {...step.pdfConfig}
      />
    )
  }

  if (step.type === 'safety_rules') {
    return (
      <Step3PolicyContent
        user={user}
        isManager={isManager}
        stepRow={stepRow}
        onCertGenerated={onCertGenerated}
      />
    )
  }

  if (step.type === 'ict_video') {
    return <Step4VideoContent user={user} isManager={isManager} />
  }

  if (step.type === 'placeholder' || !step.content) {
    return (
      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '36px 24px', textAlign: 'center', border: '2px dashed var(--border)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{step.icon}</div>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: 'var(--text)' }}>{step.title} content coming soon</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7, maxWidth: 380, margin: '0 auto' }}>
          This step will include materials such as files to download,
          PDFs to review and sign, or training videos to watch.
          Your lab manager will update this section shortly.
        </div>
      </div>
    )
  }

  if (step.type === 'video') {
    return (
      <div>
        <div style={{ aspectRatio: '16/9', background: '#000', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
          <iframe src={step.content.url} style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen title={step.title} />
        </div>
        {step.content.description && (
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{step.content.description}</div>
        )}
      </div>
    )
  }

  if (step.type === 'pdf' || step.type === 'download') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {step.content.description && (
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{step.content.description}</div>
        )}
        {(step.content.files || []).map((f, i) => (
          <a key={i} href={f.url} target="_blank" rel="noreferrer" download={step.type === 'download'}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)', transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <span style={{ fontSize: 24 }}>{step.type === 'pdf' ? '📄' : '⬇️'}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{f.label}</div>
              {f.size && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{f.size}</div>}
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
              {step.type === 'pdf' ? 'Open PDF ↗' : 'Download'}
            </span>
          </a>
        ))}
      </div>
    )
  }

  return null
}

// ── Step panel (tabs + content + actions) ─────────────────────────────────

function StepPanel({ user, progress, isStaff, onApprove, onRevoke, onCertGenerated, saving }) {
  const { setScreen, setSidebarSubTab } = useAppStore()
  const [activeStep, setActiveStep] = useState(1)
  const userProg = progress[user?.id] || {}
  const allApproved = STEPS.every(s => userProg[s.number]?.completed)

  if (!user) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>

      {/* Tab bar */}
      <div style={{ display: 'flex', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        {STEPS.map(s => {
          const done   = !!userProg[s.number]?.completed
          const active = activeStep === s.number
          return (
            <button key={s.number} onClick={() => setActiveStep(s.number)}
              style={{
                flex: 1, padding: '14px 6px', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)',
                fontSize: 12, fontWeight: 700, lineHeight: 1.3,
                background: active ? 'var(--surface)' : 'transparent',
                color: done ? '#085041' : active ? 'var(--accent)' : 'var(--text3)',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                background: done ? '#E1F5EE' : active ? '#E1F5EE' : 'var(--surface2)',
                border: `2px solid ${done ? '#1D9E75' : active ? 'var(--accent)' : 'var(--border)'}`,
                color: done ? '#1D9E75' : active ? 'var(--accent)' : 'var(--text3)',
                fontWeight: 700,
              }}>
                {done ? '✓' : s.number}
              </div>
              {s.title.toUpperCase()}
            </button>
          )
        })}
      </div>

      {/* Step content */}
      {STEPS.map(s => {
        if (s.number !== activeStep) return null
        const done    = !!userProg[s.number]?.completed
        const stepRow = userProg[s.number] || null

        return (
          <div key={s.number} style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{s.icon} {s.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>{s.description}</div>
              </div>
              {done && (
                <span style={{ flexShrink: 0, background: '#E1F5EE', color: '#085041', fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 99, border: '1px solid #9FE1CB', whiteSpace: 'nowrap' }}>
                  ✓ Approved
                </span>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <StepContentArea
                step={s}
                user={user}
                isManager={isStaff}
                stepRow={stepRow}
                onCertGenerated={extra => onCertGenerated(user.id, s.number, extra)}
              />
            </div>

            {isStaff && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                {done ? (
                  <button onClick={() => onRevoke(user.id, s.number)} disabled={saving}
                    style={{ padding: '8px 18px', background: 'none', color: '#c84b2f', border: '1px solid #c84b2f', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                    Revoke approval
                  </button>
                ) : (
                  <button onClick={() => onApprove(user.id, s.number)} disabled={saving}
                    style={{ padding: '9px 22px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                    {saving ? 'Saving…' : `✓ Approve Step ${s.number}`}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {allApproved && (
        <div style={{ borderTop: '1px solid #9FE1CB', padding: '16px 24px', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#085041' }}>🎉 All 4 steps approved!</div>
            <div style={{ fontSize: 12, color: '#085041', marginTop: 2 }}>
              {isStaff
                ? `${user.nick_name?.trim() || user.name}'s certificates have been saved to their Documents tab in Training Records.`
                : 'Your certificates have been saved to your Documents tab in Training Records.'}
            </div>
          </div>
          {!isStaff && (
            <button onClick={() => { setSidebarSubTab('fresh'); setScreen('training') }}
              style={{ padding: '10px 20px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              View Your Certificates →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component (used standalone and as Training Records tab) ───────────

export default function SafetyTab({ asTab = false, targetUser = null }) {
  const { session } = useAppStore()
  const isStaff   = session?.role === 'admin' || session?.role === 'user'
  const isLabUser = session?.role === 'lab_user'

  const [users, setUsers]           = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [progress, setProgress]     = useState({})
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [search, setSearch]         = useState('')

  useEffect(() => { if (targetUser) setSelectedUser(targetUser) }, [targetUser?.id])
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      if (isStaff) {
        const [usersRes, progRes] = await Promise.all([
          sb.from('users')
            .select('id, name, last_name, nick_name, photo_url, avatar, email')
            .eq('organization_id', session.organizationId)
            .eq('role', 'lab_user')
            .eq('is_active', true)
            .order('name'),
          sb.from('lab_safety_progress')
            .select('user_id, step_number, completed, certificate_url, submitted_at')
            .eq('organization_id', session.organizationId),
        ])
        const allUsers = usersRes.data || []
        setUsers(allUsers)

        const progMap = {}
        ;(progRes.data || []).forEach(r => {
          if (!progMap[r.user_id]) progMap[r.user_id] = {}
          progMap[r.user_id][r.step_number] = {
            completed: r.completed,
            certificate_url: r.certificate_url,
            submitted_at: r.submitted_at,
          }
        })
        setProgress(progMap)
        if (allUsers.length === 1) setSelectedUser(allUsers[0])

      } else {
        const { data: prog } = await sb.from('lab_safety_progress')
          .select('step_number, completed, certificate_url, submitted_at')
          .eq('user_id', session.userId)
        const progMap = {}
        ;(prog || []).forEach(r => {
          progMap[r.step_number] = {
            completed: r.completed,
            certificate_url: r.certificate_url,
            submitted_at: r.submitted_at,
          }
        })
        setProgress({ [session.userId]: progMap })
        setSelectedUser({ id: session.userId, name: session.username, nick_name: session.username })
      }
    } catch (e) {
      console.error('LabSafety load error:', e)
    }
    setLoading(false)
  }

  async function approveStep(userId, stepNumber) {
    setSaving(true)
    try {
      const prev = progress[userId]?.[stepNumber] || {}
      const { error } = await sb.from('lab_safety_progress').upsert({
        user_id: userId,
        organization_id: session.organizationId,
        step_number: stepNumber,
        completed: true,
        approved_by: session.userId,
        approved_at: new Date().toISOString(),
        certificate_url: prev.certificate_url || null,
        submitted_at: prev.submitted_at || null,
      }, { onConflict: 'user_id,step_number' })
      if (!error) {
        setProgress(prev => ({
          ...prev,
          [userId]: {
            ...(prev[userId] || {}),
            [stepNumber]: { ...(prev[userId]?.[stepNumber] || {}), completed: true },
          },
        }))
      }
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  async function revokeStep(userId, stepNumber) {
    setSaving(true)
    try {
      const prev = progress[userId]?.[stepNumber] || {}
      const { error } = await sb.from('lab_safety_progress').upsert({
        user_id: userId,
        organization_id: session.organizationId,
        step_number: stepNumber,
        completed: false,
        approved_by: null,
        approved_at: null,
        certificate_url: prev.certificate_url || null,
        submitted_at: prev.submitted_at || null,
      }, { onConflict: 'user_id,step_number' })
      if (!error) {
        setProgress(prev => ({
          ...prev,
          [userId]: {
            ...(prev[userId] || {}),
            [stepNumber]: { ...(prev[userId]?.[stepNumber] || {}), completed: false },
          },
        }))
      }
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  function handleCertGenerated(userId, stepNumber, extra) {
    setProgress(prev => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        [stepNumber]: {
          ...(prev[userId]?.[stepNumber] || {}),
          certificate_url: extra.certificate_url,
          submitted_at: extra.submitted_at,
        },
      },
    }))
  }

  const filteredUsers = search.trim()
    ? users.filter(u => {
        const full = [u.nick_name, u.name, u.last_name].filter(Boolean).join(' ').toLowerCase()
        return full.includes(search.toLowerCase())
      })
    : users

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={asTab ? {} : { maxWidth: 1000, margin: '0 auto' }}>
      {!asTab && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', marginBottom: 4 }}>🦺 Safety Training</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            {isStaff
              ? 'Review lab users\' safety training progress and approve each step.'
              : 'Complete all 4 steps — your lab manager will approve each one before you proceed.'}
          </div>
        </div>
      )}

      {isLabUser && selectedUser && (
        <StepPanel
          user={selectedUser}
          progress={progress}
          isStaff={false}
          onApprove={approveStep}
          onRevoke={revokeStep}
          onCertGenerated={handleCertGenerated}
          saving={saving}
        />
      )}

      {isStaff && (
        <>
          {!targetUser && (
            <>
              {users.length > 6 && (
                <div style={{ marginBottom: 16 }}>
                  <input type="search" placeholder="Search lab users…" value={search} onChange={e => setSearch(e.target.value)}
                    style={{ width: '100%', maxWidth: 300, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--sans)', color: 'var(--text)', background: 'var(--surface)' }} />
                </div>
              )}
              {filteredUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text3)', fontSize: 14, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 20 }}>
                  {users.length === 0 ? 'No lab users in this organization yet.' : 'No results for your search.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 20 }}>
                  {filteredUsers.map(u => (
                    <UserSafetyCard key={u.id} user={u} progress={progress} selected={selectedUser?.id === u.id}
                      onClick={() => setSelectedUser(prev => prev?.id === u.id ? null : u)} />
                  ))}
                </div>
              )}
            </>
          )}

          {selectedUser && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', marginBottom: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Steps for {[selectedUser.nick_name?.trim() || selectedUser.name, selectedUser.last_name].filter(Boolean).join(' ')}
              </div>
              <StepPanel
                user={selectedUser}
                progress={progress}
                isStaff={true}
                onApprove={approveStep}
                onRevoke={revokeStep}
                onCertGenerated={handleCertGenerated}
                saving={saving}
              />
            </div>
          )}

          {!selectedUser && filteredUsers.length > 1 && (
            <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text3)', fontSize: 14, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
              Select a lab user above to review and approve their safety steps.
            </div>
          )}
        </>
      )}
    </div>
  )
}
