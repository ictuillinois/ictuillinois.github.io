import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { sb } from '../../lib/supabase'
import { S3Provider } from '../../lib/storage/S3Provider'
import { SAFETY_EXAM_QUESTIONS, SAFETY_EXAM_PASS_RATIO, scoreSafetyExam, scoreQuiz, isCorrect, isAnswered, requiredPicks, passMark, optionOrderFor } from './safetyExam'
import { STEP3_QUIZ_QUESTIONS, STEP3_QUIZ_PASS_COUNT } from './step3Quiz'
import { requiredSafetySteps } from './safetySteps'
import { useAppStore } from '../../store/useAppStore'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { jsPDF } from 'jspdf'
import { buildEmailHtml } from '../../lib/emailTemplate'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// Notify every lab manager/admin in the org that a Safety step needs review —
// in-app (respecting notification_prefs) and by email when opted in. Every
// Safety-step submission path (Steps 1-4) must call this; before this fix
// only Step 4 notified managers at all, so uploads from Steps 1-3 (the
// certificates managers actually need to approve) never surfaced anywhere.
async function notifyManagersOfSafetySubmission(orgId, uploaderName, stepLabel) {
  if (!orgId) return
  try {
    const { data: managers } = await sb.from('users').select('id, email, phone')
      .eq('organization_id', orgId).in('role', ['user', 'admin']).eq('is_active', true)
    if (!managers?.length) return
    const title = `${uploaderName} submitted ${stepLabel}`
    const body  = 'Review and approve it in the Safety tab. Approving the document in Training Records does not grant home page access — the Safety tab approval is what unlocks it.'
    for (const m of managers) {
      try {
        const { data: prefs } = await sb.from('notification_prefs')
          .select('training_submitted, email_training_submitted').eq('user_id', m.id).maybeSingle()
        if (!prefs || prefs.training_submitted !== false) {
          const { error } = await sb.from('notifications').insert({ user_id: m.id, type: 'safety_step_submitted', title, body, read: false })
          if (error) console.error('[notif] safety-submitted insert failed for', m.id, error.message)
        }
        if (prefs?.email_training_submitted === true) {
          const toEmail = m.phone || m.email
          if (toEmail) {
            const htmlBody = buildEmailHtml({ title, body, ctaLabel: 'Go to Safety tab →', ctaUrl: 'https://ictlab.app/?screen=training', prefsUrl: 'https://ictlab.app/?screen=profile' })
            const { error: emailErr } = await sb.from('email_notifications_queue').insert({ to_email: toEmail, subject: title, body, html_body: htmlBody, user_id: m.id, type: 'safety_step_submitted' })
            if (!emailErr) fetch('https://ilqnwprvxwbhvrjstwsd.supabase.co/functions/v1/send-emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {})
            else console.warn('[notif] email queue insert failed:', emailErr.message)
          }
        }
      } catch (e) { console.error('[notif] manager notify failed for', m.id, e) }
    }
  } catch (e) { console.error('[notif] notifyManagersOfSafetySubmission failed:', e) }
}

async function autoSaveToDocumentsTab(userId, certUrl, certName, approved = false) {
  if (!userId || !certUrl) return
  try {
    const { data: rows } = await sb.from('training_fresh').select('id')
      .eq('user_id', userId).eq('certificate_name', certName).limit(1)
    const payload = { certificate_url: certUrl, certificate_uploaded_at: new Date().toISOString(), admin_approved: approved }
    if (rows?.[0]) {
      await sb.from('training_fresh').update(payload).eq('id', rows[0].id)
    } else {
      await sb.from('training_fresh').insert({ user_id: userId, certificate_name: certName, ...payload })
    }
  } catch (e) {
    console.error('[autoSave] error:', e)
  }
}

const STEP_DOC_NAMES = {
  // Step 1 (video) issues no document; Step 3's certificate comes from the
  // acknowledgement test. Part I / Part II entries are kept so documents saved
  // by the retired steps are still recognised on existing records.
  2: ['DRS Online Training — Part 1 Certificate', 'DRS Online Training — Part 2 Certificate'],
  'legacy_part1': ['ICT Health and Safety Program Part I — All ICT Users'],
  'legacy_part2': ['ICT Health and Safety Program Part II — Lab Users'],
}

// Documents auto-saved from the Safety tab (Steps 1-3) — approving these in
// Training Records only flags the file, it does NOT grant home page access.
// Final approval only happens via the Safety tab's own "Approve Step N".
export const SAFETY_DOC_NAMES = new Set(Object.values(STEP_DOC_NAMES).flat())

async function setDocApproval(userId, stepNumber, approved) {
  const names = STEP_DOC_NAMES[stepNumber]
  if (!names?.length) return
  for (const name of names) {
    const { data: rows } = await sb.from('training_fresh').select('id').eq('user_id', userId).eq('certificate_name', name).limit(1)
    if (rows?.[0]) await sb.from('training_fresh').update({ admin_approved: approved }).eq('id', rows[0].id)
  }
}

// ── Step configuration ─────────────────────────────────────────────────────
// Three steps as of Sept 2026. The two ICT Safety Part I / Part II PDF readers
// that used to be steps 1 and 2 are gone; their lab_safety_progress rows are
// left in place rather than deleted, since they record training that happened.
const STEPS = [
  {
    number: 1,
    title: 'Step 1',
    icon: '🎬',
    description: 'Watch the ICT Safety Training Video',
    type: 'ict_video',
    content: null,
  },
  {
    number: 2,
    title: 'Step 2',
    icon: '📝',
    description: 'Read the Laboratory Safety Guide & complete DRS online training',
    type: 'safety_rules',
  },
  {
    number: 3,
    title: 'Step 3',
    icon: '🎓',
    description: 'Watch both safety videos & pass the acknowledgement test',
    type: 'safety_exam',
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

// ── User card (labManagers view) ─────────────────────────────────────────────────

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
        {/* Only the steps this user owes — a dot for a step they were never
            assigned reads as outstanding work that will never be done. */}
        {STEPS.filter(s => requiredSafetySteps(user?.required_safety_steps).includes(s.number))
              .map(s => <StepDot key={s.number} number={s.number} completed={!!userProg[s.number]?.completed} />)}
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
      const fullName  = [firstName, lastName].filter(Boolean).join(' ') || 'Lab User'
      const dateStr   = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

      // ICT logo as a faint watermark
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
        const lSize = 180
        doc.addImage(logoDataUrl, 'PNG', W / 2 - lSize / 2, H / 2 - lSize / 2 + 8, lSize, lSize)
      }

      // Border (orange frame)
      doc.setDrawColor(255, 140, 0)
      doc.setLineWidth(3)
      doc.rect(8, 8, W - 16, H - 16)
      doc.setLineWidth(0.8)
      doc.rect(12, 12, W - 24, H - 24)

      // Corner circles
      doc.setFillColor(255, 140, 0)
      ;[[8,8],[W-8,8],[8,H-8],[W-8,H-8]].forEach(([cx, cy]) => doc.circle(cx, cy, 4, 'F'))

      // Header band
      doc.setFillColor(13, 71, 161)
      doc.rect(8, 8, W - 16, 32, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFont('times', 'bold')
      doc.setFontSize(22)
      doc.text('CERTIFICATE OF COMPLETION', W / 2, 22, { align: 'center' })
      doc.setFont('times', 'normal')
      doc.setFontSize(11)
      doc.text(certSemester, W / 2, 32, { align: 'center' })

      doc.setTextColor(80, 80, 80)
      doc.setFont('times', 'italic')
      doc.setFontSize(13)
      doc.text('This certifies that', W / 2, 60, { align: 'center' })

      doc.setFont('times', 'bold')
      doc.setFontSize(30)
      doc.setTextColor(0, 0, 0)
      doc.text(fullName, W / 2, 82, { align: 'center' })

      const nameW = doc.getTextWidth(fullName)
      doc.setDrawColor(255, 140, 0)
      doc.setLineWidth(0.6)
      doc.line(W / 2 - nameW / 2 - 8, 86, W / 2 + nameW / 2 + 8, 86)

      doc.setFont('times', 'italic')
      doc.setFontSize(13)
      doc.setTextColor(80, 80, 80)
      doc.text('has successfully completed', W / 2, 98, { align: 'center' })

      doc.setFont('times', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(20, 20, 20)
      doc.text(certTitle, W / 2, 110, { align: 'center' })

      doc.setFont('times', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(100, 100, 100)
      doc.text(certSubtitle, W / 2, 119, { align: 'center' })

      doc.setFontSize(13)
      doc.setFont('times', 'bold')
      doc.setTextColor(60, 60, 60)
      doc.text(`Date of Completion:  ${dateStr}`, W / 2, 142, { align: 'center' })

      doc.setFont('times', 'italic')
      doc.setFontSize(10)
      doc.setTextColor(120, 120, 120)
      doc.text('Note: we will remind you for the recertificate next fall semester.', W / 2, 156, { align: 'center' })

      // Footer band
      doc.setFillColor(255, 140, 0)
      doc.rect(8, H - 22, W - 16, 14, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('times', 'normal')
      doc.setFontSize(9)
      doc.text('Illinois Center for Transportation · CEE Department · University of Illinois at Urbana-Champaign', W / 2, H - 13, { align: 'center' })

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
      if (!autoUpdate) notifyManagersOfSafetySubmission(session.organizationId, fullName, `ICT Safety ${partLabel}`)

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
            {!isApproved && (
              <div style={{ fontSize: 12, color: '#085041', marginTop: 4 }}>
                Already sent to your lab manager — no need to submit it again.
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
        // A missing file does NOT arrive as a 404: the SPA fallback serves
        // index.html for any unknown path, so the fetch succeeds and PDF.js
        // fails on HTML — which used to be reported as a connection problem.
        // Every PDF starts with the bytes %PDF.
        const magic = new TextDecoder().decode(new Uint8Array(data.slice(0, 5)))
        if (magic !== '%PDF-') throw new Error(`NOT_A_PDF:${pdfPath}`)
        const doc = await pdfjsLib.getDocument({ data }).promise
        if (!cancelled) { setPdfDoc(doc); setTotalPages(doc.numPages) }
      } catch (e) {
        console.error('[SimplePDFViewer] load failed:', pdfPath, e)
        if (!cancelled) setPdfError(
          String(e?.message || '').startsWith('NOT_A_PDF')
            ? `This document has not been uploaded yet (${pdfPath}). Ask your lab manager to add it.`
            : 'Failed to load PDF. Please check your connection and try again.')
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
            {done ? 'Review Document Again' : `Open Document${(maxPages || totalPages) ? ` (${maxPages || totalPages} pages)` : ''}`}
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
  // Laboratory Safety Guide: read to the last page, then confirm. Stored in the
  // same certificate_url JSON blob the other items use.
  const [guideRead, setGuideRead]     = useState(!!savedUrls.guide)
  const [guideAtEnd, setGuideAtEnd]   = useState(!!savedUrls.guide)
  const [savingGuide, setSavingGuide] = useState(false)

  // External cert uploads
  const [ext1Url, setExt1Url]   = useState(savedUrls.ext1 || null)
  const [ext2Url, setExt2Url]   = useState(savedUrls.ext2 || null)
  const [uploading1, setUploading1] = useState(false)
  const [uploading2, setUploading2] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const ext1InputRef = useRef(null)
  const ext2InputRef = useRef(null)

  async function saveProgress(updates) {
    // `guide` must be carried in the base object, not only when it arrives in
    // updates — otherwise the next save (an upload) drops the confirmation the
    // user already gave.
    // savedUrls.form is carried through untouched: the compliance form is
    // retired, but a record that already has one must not lose it on the next
    // save.
    const urls = { form: savedUrls.form || null, guide: guideRead, ext1: ext1Url, ext2: ext2Url, ...updates }
    const allDone = !!urls.guide && !!urls.ext1 && !!urls.ext2
    const wasAllDoneBefore = !!savedUrls.guide && !!savedUrls.ext1 && !!savedUrls.ext2
    const submittedAt = allDone ? (stepRow?.submitted_at || new Date().toISOString()) : (stepRow?.submitted_at || null)
    const payload = {
      user_id: user.id,
      organization_id: session.organizationId,
      step_number: 2,
      completed: false,
      certificate_url: JSON.stringify(urls),
      submitted_at: submittedAt,
    }
    const { error: upsertErr } = await sb.from('lab_safety_progress')
      .upsert(payload, { onConflict: 'user_id,step_number' })
    if (upsertErr) { console.error('[LabSafety] saveProgress failed:', upsertErr); return false }
    if (allDone && !wasAllDoneBefore) {
      const fullName = user?.nick_name?.trim() || [user?.name, user?.last_name].filter(Boolean).join(' ') || 'A lab user'
      notifyManagersOfSafetySubmission(session.organizationId, fullName, 'ICT Safety Compliance Documents')
    }
    onCertGenerated({ certificate_url: JSON.stringify(urls), submitted_at: submittedAt })
    return true
  }

  async function confirmGuide() {
    if (guideRead || savingGuide) return
    setSavingGuide(true)
    const ok = await saveProgress({ guide: true })
    setSavingGuide(false)
    // Only flip the box once the write actually landed — a checkbox that ticks
    // itself and then silently did not save is worse than one that refuses.
    if (ok !== false) setGuideRead(true)
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
          Lab users must: (1) read the <strong>Laboratory Safety Guide</strong> in full and confirm it, and (2) complete both online DRS training modules and upload their completion certificates.
        </div>
        {!hasAny ? (
          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, border: '2px dashed var(--border)', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No documents submitted yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Laboratory Safety Guide — read & confirmed', url: null, done: !!urls.guide },
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
  // The compliance form (Appendix D) was removed Sept 2026; the Laboratory
  // Safety Guide confirmation takes its place in the completion check.
  const allDone = guideRead && !!ext1Url && !!ext2Url

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Submitted banner */}
      {isSubmitted && (
        <div style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#085041', lineHeight: 1.7 }}>
          <span style={{ fontWeight: 700 }}>✓ All Step 2 documents submitted — awaiting lab manager approval.</span><br />
          All certificates have been saved to your <strong>Training Records → Documents tab</strong>. Already sent to your lab manager — no need to submit them again.
        </div>
      )}

      {/* ── Card 1: Laboratory Safety Guide ── */}
      <div style={{ border: `1px solid ${guideRead ? '#9FE1CB' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: guideRead ? '#E1F5EE' : 'var(--surface2)', borderBottom: `1px solid ${guideRead ? '#9FE1CB' : 'var(--border)'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E1F5EE', border: '2px solid #1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#1D9E75', flexShrink: 0 }}>1</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Laboratory Safety Guide</div>
          {guideRead && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#085041' }}>✓ Confirmed</span>}
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 12 }}>
            Read the <strong>Laboratory Safety Guide — Chemical Hygiene Plan and Safety Policies</strong>
            (University of Illinois, Division of Research Safety). The confirmation box appears once you have opened it.
          </div>
          {/* Opens DRS's own copy rather than a 17-page reader embedded here.
              That also means the guide is always the current published version
              instead of whatever was bundled the day it was last copied.

              The trade-off is real: the inline reader could require reaching
              the last page before offering the confirmation. A link cannot
              know whether it was read, only that it was opened — so the
              confirmation now appears once the guide has been opened. */}
          <a
            href={SAFETY_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => setGuideAtEnd(true)}
            style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--surface2)',
                     border:'1px solid var(--border)', borderRadius:10, textDecoration:'none', color:'var(--text)' }}
          >
            <span style={{ fontSize:24 }}>📄</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:600, fontSize:14 }}>Laboratory Safety Guide</div>
              <div style={{ fontSize:12, color:'var(--text3)' }}>Chemical Hygiene Plan and Safety Policies · opens at drs.illinois.edu</div>
            </div>
            <span style={{ fontSize:13, fontWeight:600, color:'var(--accent)', whiteSpace:'nowrap' }}>Open guide ↗</span>
          </a>
          {(guideAtEnd || guideRead) && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '10px 14px', borderRadius: 10, background: '#E1F5EE', border: '1px solid #9FE1CB', cursor: guideRead ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, color: '#085041' }}>
              <input type="checkbox" checked={guideRead} disabled={guideRead || savingGuide}
                onChange={confirmGuide} style={{ width: 'auto' }} />
              I confirm reading the Laboratory Safety Guide
            </label>
          )}
        </div>
      </div>

      {/* ── Card 2: External Training ── */}
      <div style={{ border: `1px solid ${(ext1Url && ext2Url) ? '#9FE1CB' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: (ext1Url && ext2Url) ? '#E1F5EE' : 'var(--surface2)', borderBottom: `1px solid ${(ext1Url && ext2Url) ? '#9FE1CB' : 'var(--border)'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: (ext1Url && ext2Url) ? '#1D9E75' : '#E1F5EE', border: `2px solid ${(ext1Url && ext2Url) ? '#1D9E75' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: (ext1Url && ext2Url) ? '#fff' : '#9ca3af', flexShrink: 0 }}>
            {(ext1Url && ext2Url) ? '✓' : '2'}
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
          {[guideRead, (!!ext1Url && !!ext2Url)].filter(Boolean).length} / 2 items submitted
          {allDone ? ' — step will be marked as submitted' : ''}
        </div>
      )}
    </div>
  )
}

// ── Step 1: ICT Safety Video ───────────────────────────────────────────────

// Every safety video lives in AWS S3, not in the repo and not in Supabase
// Storage. They are 45-91 MB: committing them would add ~220 MB to git history
// permanently and the build would copy them into docs/ again, and Supabase's
// free tier rejects any file over 50 MB. S3 already backs this project's files
// (ictlab-files, via the s3-presign function) and serves HTTP range requests,
// so the browser streams and seeks rather than downloading first.
//
// Keys are the objects as actually uploaded — spaces, capitals and all. S3 has
// no true rename, so matching the code to the bucket beats re-uploading 220 MB
// to tidy the names.
// Which videos a user has watched is stored on their lab_safety_progress row,
// not in localStorage: the marker follows the person between laptop and phone,
// and the annual reset clears it along with everything else instead of needing
// a version constant bumped by hand.
//
// It costs no extra reads — both steps already fetch this row on mount — and
// one write per video ever. The videos themselves stream from S3, so none of
// this touches Supabase bandwidth.
async function markVideoWatched(userId, stepNumber, orgId, key, current) {
  const next = Array.from(new Set([...(current || []), key]))
  const { error } = await sb.from('lab_safety_progress').upsert({
    user_id: userId,
    step_number: stepNumber,
    organization_id: orgId,
    videos_watched: next,
  }, { onConflict: 'user_id,step_number' })
  // Best effort: failing to record it must never block the person watching.
  // The cost of a lost write is being asked to watch again, never less.
  if (error) console.warn('[safety] watch not recorded:', error.message)
  return next
}

// DRS's published copy, not a bundled snapshot: a safety guide that silently
// goes out of date is worse than one that takes a click to reach.
const SAFETY_GUIDE_URL = 'https://drs.illinois.edu/site-documents/LaboratorySafetyGuide.pdf'

const SAFETY_VIDEOS = {
  step1: 'ext:s3:safety-videos/ICT-Building-safety-video.mp4',
  part1: 'ext:s3:safety-videos/Lab safety part 1.mp4',
  part2: 'ext:s3:safety-videos/Lab safety part 2.mp4',
}

// One player for all three. The presign + expiry-retry + missing-file reporting
// existed once per step before; a third copy is how they drift.
// WATCH_COVERAGE: how much of the running time must actually be played before
// the step counts as watched. Not 100% — a few dropped frames at the end, or a
// video whose final second never fires a timeupdate, would otherwise strand
// someone who genuinely sat through it.
const WATCH_COVERAGE = 0.95
// Any forward jump bigger than this is a seek, not playback, and contributes
// nothing. This is what stops dragging the scrubber to the end from counting.
const MAX_TICK_SECONDS = 2

function SafetyVideo({ extRef, onWatched, minHeight = 240, maxHeight = 480 }) {
  const [src, setSrc] = useState(null)
  const [missing, setMissing] = useState(false)
  const [progress, setProgress] = useState(0)
  const retried = useRef(false)
  const watchedSec = useRef(0)
  const lastPos = useRef(0)
  const done = useRef(false)

  const resolve = useCallback(async () => {
    try {
      setSrc(await new S3Provider().resolveUrl(extRef))
      setMissing(false)
    } catch (e) {
      console.error('[safety video] presign failed:', extRef, e)
      setMissing(true)
    }
  }, [extRef])

  useEffect(() => { retried.current = false; resolve() }, [resolve])

  // Count only real playback. `timeupdate` fires a few times a second; a delta
  // inside MAX_TICK_SECONDS is someone watching, anything larger is a seek.
  // Seeking backwards to re-watch is fine and simply re-accrues time.
  function handleTimeUpdate(e) {
    const v = e.currentTarget
    const pos = v.currentTime
    const delta = pos - lastPos.current
    lastPos.current = pos
    if (delta > 0 && delta <= MAX_TICK_SECONDS) watchedSec.current += delta
    const dur = v.duration
    if (!dur || !isFinite(dur)) return
    const pct = Math.min(1, watchedSec.current / dur)
    setProgress(pct)
    if (!done.current && pct >= WATCH_COVERAGE) {
      done.current = true
      onWatched?.()
    }
  }

  // Reaching the end is only proof if the time was actually put in.
  function handleEnded(e) {
    const dur = e.currentTarget.duration
    if (!done.current && dur && watchedSec.current / dur >= WATCH_COVERAGE) {
      done.current = true
      onWatched?.()
    }
  }

  // A presigned GET is good for an hour. Resolve once more before calling the
  // file missing — an hour-old open tab is likelier than a vanished upload.
  function handleError() {
    if (!retried.current) { retried.current = true; resolve(); return }
    setMissing(true)
  }

  if (missing) {
    // Name the key and the bucket. "Video unavailable" sends whoever has to fix
    // it hunting; this exact mismatch has already cost two rounds of guessing.
    return (
      <div style={{ fontSize: 13, color: '#c84b2f', background: '#fdf0ed', border: '1px solid #f0c9bd', borderRadius: 8, padding: '12px 14px', lineHeight: 1.6 }}>
        This video could not be loaded — <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{extRef.replace('ext:s3:', '')}</span> is
        missing from the <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>ictlab-files</span> S3 bucket, or the name does not match exactly.
      </div>
    )
  }

  if (!src) {
    return (
      <div style={{ minHeight, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text3)' }}>
        Loading video…
      </div>
    )
  }

  return (
    <div>
      <video
        src={src}
        controls
        preload="metadata"
        controlsList="nodownload"
        onContextMenu={e => e.preventDefault()}
        onTimeUpdate={handleTimeUpdate}
        onSeeked={e => { lastPos.current = e.currentTarget.currentTime }}
        onEnded={handleEnded}
        onError={handleError}
        style={{ width: '100%', minHeight, borderRadius: 8, background: '#000', display: 'block', maxHeight }}
      />
      {/* Show the watched share, not the scrubber position — otherwise someone
          who skipped ahead sees a full bar and cannot tell why it is still
          locked. */}
      {!done.current && progress > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: 'var(--accent)', transition: 'width 0.3s' }} />
          </div>
          <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
            {Math.round(progress * 100)}% watched — skipping ahead does not count
          </div>
        </div>
      )}
    </div>
  )
}

// Step 3's two videos live in AWS S3, not in the repo and not in Supabase
// Storage. They are 84 MB and 91 MB: committing them would add 175 MB to git
// history permanently and the build would copy both into docs/ again, and
// Supabase's free tier rejects any file over 50 MB. S3 already backs this
// project's files (ictlab-files, via the s3-presign function), serves HTTP
// range requests so the browser streams rather than downloading first, and
// costs pennies a year at this volume.
// Keys match the objects as they were actually uploaded, spaces and capitals
// included. S3 keys may contain spaces — the presigner encodes them — so this
// is not worth re-uploading 175 MB to tidy.
const STEP3_VIDEOS = [
  { key: 'part1', label: 'Part 1', title: 'Lab Safety — Part 1', ref: SAFETY_VIDEOS.part1 },
  { key: 'part2', label: 'Part 2', title: 'Lab Safety — Part 2', ref: SAFETY_VIDEOS.part2 },
]

function Step3VideosContent({ user, isManager }) {
  const { session } = useAppStore()
  const userId = user?.id
  const [watched, setWatched] = useState({})
  const [watchedList, setWatchedList] = useState([])
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [saved, setSaved] = useState(null)
  const [retakeSeq, setRetakeSeq] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) return
    sb.from('lab_safety_progress')
      .select('completed, submitted_at, videos_watched, exam_passed, exam_score, exam_total, exam_attempts')
      .eq('user_id', userId).eq('step_number', 3).maybeSingle()
      .then(({ data }) => {
        setSaved(data || null)
        const list = Array.isArray(data?.videos_watched) ? data.videos_watched : []
        setWatchedList(list)
        // An approved step means they watched it; don't make them sit through
        // both again because the row predates this column.
        const done = data?.completed
          ? STEP3_VIDEOS.map(v => v.key)
          : list
        setWatched(Object.fromEntries(done.map(k => [k, true])))
      })
  }, [userId])

  const allWatched = STEP3_VIDEOS.every(v => watched[v.key])

  // Part 2 does not exist on the page until Part 1 is finished. Rendering both
  // let a user start them playing side by side and sit through the pair in the
  // time of one — the watch tracking counts each video honestly, but nothing
  // stopped them running at once. It also paces the step: you finish one and
  // then discover the next, rather than seeing a wall of video up front.
  const firstUnwatched = STEP3_VIDEOS.findIndex(v => !watched[v.key])
  const visibleVideos = firstUnwatched === -1
    ? STEP3_VIDEOS
    : STEP3_VIDEOS.slice(0, firstUnwatched + 1)

  async function markWatched(key) {
    setWatched(w => ({ ...w, [key]: true }))     // reveal the next part at once
    const next = await markVideoWatched(userId, 3, session?.organizationId || null, key, watchedList)
    setWatchedList(next)
  }

  const answeredAll = STEP3_QUIZ_QUESTIONS.every(q => isAnswered(q, answers[q.id]))

  async function submitQuiz() {
    if (saving || !answeredAll) return
    setError(null)
    setSaving(true)
    const r = scoreQuiz(STEP3_QUIZ_QUESTIONS, answers, STEP3_QUIZ_PASS_COUNT)
    setResult(r)

    const orgId = session?.organizationId || null
    const attempts = (saved?.exam_attempts || 0) + 1
    // submitted_at only on a pass: it is what puts them in the manager's
    // approval queue, and a failed attempt is not a submission.
    const patch = {
      user_id: userId,
      step_number: 3,
      organization_id: orgId,
      exam_score: r.score,
      exam_total: r.total,
      exam_passed: r.passed,
      exam_attempts: attempts,
      exam_at: new Date().toISOString(),
      ...(r.passed ? { submitted_at: new Date().toISOString() } : {}),
    }
    const { error: err } = await sb.from('lab_safety_progress')
      .upsert(patch, { onConflict: 'user_id,step_number' })
    if (err) {
      console.error('Step 3 quiz save error:', err)
      setError('Your answers were scored but could not be saved. Please try again.')
      setSaving(false)
      return
    }
    setSaved(s => ({ ...(s || {}), ...patch }))

    if (r.passed && orgId) {
      const fullName = user?.nick_name?.trim() || [user?.name, user?.last_name].filter(Boolean).join(' ') || 'A lab user'
      notifyManagersOfSafetySubmission(orgId, fullName, 'the Lab User Quiz (Step 3)')
    }
    setSaving(false)
  }

  function retakeQuiz() {
    setAnswers({})
    setResult(null)
    setRetakeSeq(n => n + 1)
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 14 }}>
        Watch the safety video below in full. The confirmation unlocks once every part
        has been watched.
      </div>

      {visibleVideos.map(v => (
        <div key={v.key} style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)' }}>
              {v.label}
            </span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{v.title}</span>
            {watched[v.key] && (
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#085041', background: '#E1F5EE', borderRadius: 6, padding: '2px 8px' }}>
                Watched
              </span>
            )}
          </div>
          <SafetyVideo extRef={v.ref} onWatched={() => markWatched(v.key)} minHeight={220} maxHeight={440} />
        </div>
      ))}

      {visibleVideos.length < STEP3_VIDEOS.length && (
        <div style={{ fontSize: 12.5, color: 'var(--text3)', fontStyle: 'italic', textAlign: 'center', marginBottom: 12 }}>
          The next part appears once this one has been watched in full.
        </div>
      )}

      {/* The quiz replaces the old "I watched both" checkbox, mirroring Step 1:
          ticking a box proved nothing, and a knowledge check is the thing the
          approval is actually for. */}
      {!isManager && (
        <SafetyExamPanel
          questions={STEP3_QUIZ_QUESTIONS}
          passRatio={STEP3_QUIZ_PASS_COUNT}
          title="Lab User Quiz"
          userId={userId}
          attempt={(saved?.exam_attempts || 0) + retakeSeq}
          locked={!allWatched}
          lockedMessage="The quiz unlocks after you have watched both videos in full."
          answers={answers}
          setAnswers={setAnswers}
          answeredAll={answeredAll}
          result={result}
          saved={saved}
          alreadyPassed={!!(saved?.exam_passed || saved?.completed)}
          approved={!!saved?.completed}
          stepLabel="Step 3"
          saving={saving}
          error={error}
          onSubmit={submitQuiz}
          onRetake={retakeQuiz}
        />
      )}
    </div>
  )
}

function Step4VideoContent({ user, isManager }) {
  const { session } = useAppStore()
  const userId = user?.id
  const [videoWatched, setVideoWatched] = useState(false)
  const [watchedList, setWatchedList] = useState([])

  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)     // last submitted attempt
  const [saved, setSaved] = useState(null)       // row already in the DB
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  // Counts retakes in THIS session. The shuffle must not depend solely on the
  // stored attempt count: if the save fails, that number never moves and the
  // retake serves up the first attempt's order again — exactly the failure
  // this is guarding against.
  const [retakeSeq, setRetakeSeq] = useState(0)

  useEffect(() => {
    if (!userId) return
    sb.from('lab_safety_progress')
      .select('completed, submitted_at, exam_passed, exam_score, exam_total, exam_attempts, videos_watched')
      .eq('user_id', userId).eq('step_number', 1).maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setSaved(data)
        const list = Array.isArray(data.videos_watched) ? data.videos_watched : []
        setWatchedList(list)
        // Someone who already passed has plainly watched it; don't make them
        // sit through the video again on a row that predates this column.
        if (list.includes('step1') || data.exam_passed || data.completed) setVideoWatched(true)
      })
  }, [userId])

  async function handleVideoEnded() {
    setVideoWatched(true)                        // unlock the questions at once
    const next = await markVideoWatched(userId, 1, session?.organizationId || null, 'step1', watchedList)
    setWatchedList(next)
  }

  const answeredAll = SAFETY_EXAM_QUESTIONS.every(q => answers[q.id])
  const alreadyPassed = !!(saved?.exam_passed || saved?.completed)
  const approved = !!saved?.completed

  async function submitExam() {
    if (saving || !answeredAll) return
    setError(null)
    setSaving(true)
    const r = scoreSafetyExam(answers)
    setResult(r)

    const orgId = session?.organizationId || null
    const attempts = (saved?.exam_attempts || 0) + 1
    // submitted_at is set only on a pass: it is what puts the user in the
    // manager's approval queue, and a failed attempt is not a submission.
    const patch = {
      user_id: userId,
      step_number: 1,
      organization_id: orgId,
      exam_score: r.score,
      exam_total: r.total,
      exam_passed: r.passed,
      exam_attempts: attempts,
      exam_at: new Date().toISOString(),
      ...(r.passed ? { submitted_at: new Date().toISOString() } : {}),
    }
    const { error: err } = await sb.from('lab_safety_progress')
      .upsert(patch, { onConflict: 'user_id,step_number' })
    if (err) {
      console.error('Safety exam save error:', err)
      setError('Your answers were scored but could not be saved. Please try again.')
      setSaving(false)
      return
    }
    setSaved(s => ({ ...(s || {}), ...patch }))

    if (r.passed && orgId) {
      const fullName = user?.nick_name?.trim() || [user?.name, user?.last_name].filter(Boolean).join(' ') || 'A lab user'
      notifyManagersOfSafetySubmission(orgId, fullName, 'the Building Safety knowledge check (Step 1)')
    }
    setSaving(false)
  }

  function retake() {
    setAnswers({})
    setResult(null)
    setRetakeSeq(n => n + 1)
  }

  return (
    <div>
      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 12 }}>
          Watch the ICT Building Safety Video below, then answer the knowledge check.
          The questions unlock once you have watched the video in full.
        </div>
        <SafetyVideo extRef={SAFETY_VIDEOS.step1} onWatched={handleVideoEnded} />
        {!videoWatched && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', textAlign: 'center' }}>
            Watch the full video to unlock the knowledge check below.
          </div>
        )}
      </div>

      {!isManager && (
        <SafetyExamPanel
          userId={userId}
          attempt={(saved?.exam_attempts || 0) + retakeSeq}
          locked={!videoWatched}
          answers={answers}
          setAnswers={setAnswers}
          answeredAll={answeredAll}
          result={result}
          saved={saved}
          alreadyPassed={alreadyPassed}
          approved={approved}
          saving={saving}
          error={error}
          onSubmit={submitExam}
          onRetake={retake}
        />
      )}
    </div>
  )
}

// The knowledge check itself. One question on screen at a time: the whole test
// visible at once invites scanning ahead, and with a 5-of-5 pass rule a wall of
// questions reads as more daunting than it is.
function SafetyExamPanel({ questions = SAFETY_EXAM_QUESTIONS, passRatio = SAFETY_EXAM_PASS_RATIO,
                           title = 'Building Safety knowledge check',
                           lockedMessage = 'The knowledge check unlocks after you have watched the full video.',
                           stepLabel = 'Step 1', userId, attempt = 0, locked, answers, setAnswers, answeredAll, result, saved,
                           alreadyPassed, approved, saving, error, onSubmit, onRetake }) {
  const [current, setCurrent] = useState(0)

  // Computed once per attempt. Calling optionOrderFor during render would
  // re-derive the academic year on every keystroke, and an attempt spanning
  // midnight on 1 August would reorder the options mid-question.
  const orders = useMemo(() => Object.fromEntries(
    questions.map(q => [q.id, optionOrderFor(q, userId, attempt)])
  ), [questions, userId, attempt])
  const total = questions.length
  const needed = passMark(total, passRatio)

  // Start a retake at the beginning rather than wherever the last one ended.
  useEffect(() => { if (!result) setCurrent(0) }, [result])

  // A pass ends it. The questions and answers are never shown again — not on
  // the pass screen, not on a revisit — so a passed user cannot reopen the
  // paper and pass it around. Checked BEFORE `result`, so the review does not
  // render for the attempt that just passed either.
  if (alreadyPassed || result?.passed) {
    return (
      <div style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 10, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#085041', marginBottom: 6 }}>
          {approved ? `✓ ${stepLabel} approved by your lab manager` : '✓ Passed — awaiting lab manager approval'}
        </div>
        <div style={{ fontSize: 13, color: '#085041', lineHeight: 1.6 }}>
          {approved
            ? 'Nothing further is needed for this step.'
            : 'Your result has been sent to your lab manager. You will get access once they approve it.'}
          {(() => {
            const sc = result?.score ?? saved?.exam_score
            const tt = result?.total ?? saved?.exam_total
            return typeof sc === 'number' ? <> Your score: <strong>{sc} / {tt}</strong>.</> : null
          })()}
        </div>
      </div>
    )
  }

  if (locked) {
    return (
      <div style={{ background: '#f5f5f5', border: '1px solid var(--border)', borderRadius: 10, padding: 16, opacity: 0.6, fontSize: 13, color: 'var(--text3)' }}>
        {lockedMessage}
      </div>
    )
  }

  // ── after a failed attempt ───────────────────────────────────────────────
  //
  // Deliberately NO correct answers and no explanations here. Printing them
  // for each miss would hand the whole key to anyone willing to fail once on
  // purpose, which is exactly the hole the randomised option order is meant to
  // close. What it does give is which topics were missed, so the retake is
  // directed rather than blind.
  if (result) {
    const missed = questions.filter(q => !isCorrect(q, answers[q.id]))
    return (
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
        <div style={{ background: '#fdf0ed', border: '1px solid #f0c9bd', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#c84b2f', marginBottom: 6 }}>
            Not passed — {result.score} / {result.total}. You need {result.needed} correct.
          </div>
          <div style={{ fontSize: 13, color: '#c84b2f', lineHeight: 1.6 }}>
            Re-watch the video for the topics below, then try again. There is no limit on attempts.
          </div>
          {error && (
            <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: '#c84b2f' }}>{error}</div>
          )}
        </div>

        <div style={{ fontSize: 12.5, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)', marginBottom: 8 }}>
          Topics to review
        </div>
        {missed.map(q => (
          <div key={q.id} style={{ fontSize: 13.5, lineHeight: 1.55, padding: '10px 13px', marginBottom: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
            {q.question}
          </div>
        ))}

        <button className="btn btn-primary" onClick={onRetake} style={{ width: '100%', marginTop: 12 }}>
          Retake the knowledge check
        </button>
      </div>
    )
  }

  // ── taking it: one question at a time ────────────────────────────────────
  const q = questions[current]
  const picked = answers[q.id]
  const isLast = current === total - 1

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
          {current + 1} / {total}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 12 }}>
        {needed} of {total} correct to pass · retake as often as you need
      </div>

      {/* Progress pips: how far along, without showing what is coming. */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 18 }}>
        {questions.map((qq, n) => (
          <div key={qq.id} style={{
            height: 4, flex: 1, borderRadius: 2,
            background: n < current ? 'var(--accent)' : n === current ? 'var(--accent)' : 'var(--border)',
            opacity: n <= current ? 1 : 0.5,
          }} />
        ))}
      </div>

      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: q.type === 'multi' ? 6 : 14, lineHeight: 1.55 }}>{q.question}</div>
      {q.type === 'multi' && (
        <div style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
          Select all that apply — choose {requiredPicks(q)}.
        </div>
      )}

      {/* Displayed position is this user's shuffle; `key` is the true option
          so the stored answer means the same thing for everyone. */}
      {orders[q.id].map((key, pos) => {
        const text = q.options[key]
        const letter = String.fromCharCode(97 + pos)   // a, b, c, d by position
        const isPicked = q.type === 'multi' ? (picked || []).includes(key) : picked === key
        return (
          <label key={key} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px', marginBottom: 7,
            background: isPicked ? 'var(--accent-light)' : 'var(--surface)',
            border: `1px solid ${isPicked ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8, cursor: saving ? 'default' : 'pointer', fontSize: 13.5, lineHeight: 1.5,
          }}>
            <input
              type={q.type === 'multi' ? 'checkbox' : 'radio'}
              name={q.id}
              checked={isPicked}
              disabled={saving}
              onChange={() => setAnswers(a => {
                if (q.type !== 'multi') return { ...a, [q.id]: key }
                const cur = a[q.id] || []
                if (cur.includes(key)) return { ...a, [q.id]: cur.filter(x => x !== key) }
                // Ticking a third when two are wanted would silently drop one
                // or leave an unanswerable state; refuse it and let them
                // untick first.
                if (cur.length >= requiredPicks(q)) return a
                return { ...a, [q.id]: [...cur, key] }
              })}
              // index.css sets a global `input { width: 100% }`. Without an
              // explicit width the radio fills the whole row, centring its
              // circle and pushing the option text to the far right.
              style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, accentColor: '#1D9E75' }}
            />
            <span><strong style={{ marginRight: 6 }}>{letter.toUpperCase()})</strong>{text}</span>
          </label>
        )
      })}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        {/* Back matters here: a mis-click with a 5-of-5 pass rule would
            otherwise cost a guaranteed fail and a full retake. */}
        {current > 0 && (
          <button className="btn btn-sm" onClick={() => setCurrent(c => c - 1)} disabled={saving}>← Back</button>
        )}
        <div style={{ marginLeft: 'auto' }}>
          {!isAnswered(q, picked) ? (
            <span style={{ fontSize: 12.5, color: 'var(--text3)', fontStyle: 'italic' }}>
              {q.type === 'multi'
                ? `Select ${requiredPicks(q)} to continue — ${(picked || []).length} of ${requiredPicks(q)} chosen`
                : 'Choose an answer to continue'}
            </span>
          ) : isLast ? (
            <button className="btn btn-primary" onClick={onSubmit} disabled={!answeredAll || saving}>
              {saving ? 'Submitting…' : 'Submit answers'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setCurrent(c => c + 1)} disabled={saving}>
              Next →
            </button>
          )}
        </div>
      </div>
      {isLast && !answeredAll && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: '#c84b2f' }}>
          Some earlier questions are unanswered — use Back to finish them.
        </div>
      )}
      {error && <div style={{ marginTop: 8, fontSize: 12, color: '#c84b2f' }}>{error}</div>}
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

  if (step.type === 'safety_exam') {
    return <Step3VideosContent user={user} isManager={isManager} />
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

function StepPanel({ user, progress, isLabManager, onApprove, onRevoke, onCertGenerated, saving }) {
  const { setScreen, setSidebarSubTab } = useAppStore()
  const [activeStep, setActiveStep] = useState(1)
  const userProg = progress[user?.id] || {}
  // Only the steps this user owes count toward "all done" — and only those are
  // listed. A part-time user assigned two of three must not be told they are
  // incomplete forever by a step nobody asked them to do.
  const required = requiredSafetySteps(user?.required_safety_steps)
  const mySteps = STEPS.filter(s => required.includes(s.number))
  const allApproved = mySteps.every(s => userProg[s.number]?.completed)

  if (!user) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>

      {/* Tab bar */}
      <div style={{ display: 'flex', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        {mySteps.map(s => {
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
      {mySteps.map(s => {
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
                isManager={isLabManager}
                stepRow={stepRow}
                onCertGenerated={extra => onCertGenerated(user.id, s.number, extra)}
              />
            </div>

            {/* The manager decides on pass/fail, so that is what is shown. The
                numeric score stays with the lab user: a manager does not need
                to know whether someone scraped through or aced it to approve,
                and showing it invites judging the mark rather than the result. */}
            {isLabManager && (s.number === 1 || s.number === 3) && (
              <div style={{
                marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.6,
                background: stepRow?.exam_passed ? '#E1F5EE' : 'var(--surface2)',
                border: `1px solid ${stepRow?.exam_passed ? '#9FE1CB' : 'var(--border)'}`,
                color: stepRow?.exam_passed ? '#085041' : 'var(--text2)',
              }}>
                <strong>{s.number === 1 ? 'Knowledge check' : 'Lab User Quiz'}:</strong>{' '}
                {stepRow?.exam_passed
                  ? 'Passed'
                  : stepRow?.exam_attempts
                    ? 'Not passed yet'
                    : 'Not attempted yet'}
                {stepRow?.exam_attempts > 1 && ` · ${stepRow.exam_attempts} attempts`}
                {!stepRow?.exam_passed && ' — approving now would bypass it.'}
              </div>
            )}

            {isLabManager && (
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

      {/* Nudge to the next step once this one is approved. Without it the step
          just turns green and nothing tells the user there is more to do — the
          only cue was a tab colour change they had no reason to look for.
          Hidden on the last step, which has the completion banner below.
          Note the `.completed` check: progress here is an object per step, not
          a boolean, so a truthy test would light this up for every step. */}
      {!allApproved && (() => {
        const cur  = STEPS.find(x => x.number === activeStep)
        const next = STEPS.find(x => x.number === activeStep + 1)
        if (!cur || !next || !userProg[cur.number]?.completed) return null
        return (
          <div style={{ borderTop: '1px solid #9FE1CB', padding: '14px 24px', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#085041' }}>✓ {cur.title} approved</div>
              <div style={{ fontSize: 12, color: '#085041', marginTop: 2 }}>
                {isLabManager
                  ? `Next up for ${user.nick_name?.trim() || user.name}: ${next.title} — ${next.description}.`
                  : `Next: ${next.title} — ${next.description}.`}
              </div>
            </div>
            <button onClick={() => setActiveStep(next.number)}
              style={{ padding: '10px 20px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Go to {next.title} →
            </button>
          </div>
        )
      })()}

      {allApproved && (
        <div style={{ borderTop: '1px solid #9FE1CB', padding: '16px 24px', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#085041' }}>{`🎉 All ${STEPS.length} steps approved!`}</div>
            <div style={{ fontSize: 12, color: '#085041', marginTop: 2 }}>
              {isLabManager
                ? `${user.nick_name?.trim() || user.name}'s certificates have been saved to their Documents tab in Training Records.`
                : 'Your certificates have been saved to your Documents tab in Training Records.'}
            </div>
          </div>
          {!isLabManager && (
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
  const isLabManager   = session?.role === 'admin' || session?.role === 'user'
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
      if (isLabManager) {
        const [usersRes, progRes] = await Promise.all([
          sb.from('users')
            .select('id, name, last_name, nick_name, photo_url, avatar, email, required_safety_steps')
            .eq('organization_id', session.organizationId)
            .eq('role', 'lab_user')
            .eq('is_active', true)
            .order('name'),
          sb.from('lab_safety_progress')
            .select('user_id, step_number, completed, certificate_url, submitted_at, exam_passed, exam_attempts')
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
          .select('step_number, completed, certificate_url, submitted_at, exam_passed, exam_attempts')
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
        const { data: me } = await sb.from('users')
          .select('id, name, last_name, nick_name, photo_url, avatar, email, required_safety_steps')
          .eq('id', session.userId).maybeSingle()
        setSelectedUser(me || { id: session.userId, name: session.username, nick_name: session.username })
        // One-time backfill: sync existing certs to Documents tab for users who completed steps before auto-save was added
        const syncKey = `ictlab_docs_synced_${session.userId}`
        if (!localStorage.getItem(syncKey)) {
          ;(prog || []).forEach(async r => {
            const approved = !!r.completed
            if (r.step_number === 1 && r.certificate_url)
              await autoSaveToDocumentsTab(session.userId, r.certificate_url, 'ICT Health and Safety Program Part I — All ICT Users', approved)
            if (r.step_number === 2 && r.certificate_url)
              await autoSaveToDocumentsTab(session.userId, r.certificate_url, 'ICT Health and Safety Program Part II — Lab Users', approved)
            if (r.step_number === 3 && r.certificate_url) {
              try {
                const urls = JSON.parse(r.certificate_url)
                if (urls.form) await autoSaveToDocumentsTab(session.userId, urls.form, 'ICT Safety Rules — Compliance Form (Appendix D)', approved)
                if (urls.ext1) await autoSaveToDocumentsTab(session.userId, urls.ext1, 'DRS Online Training — Part 1 Certificate', approved)
                if (urls.ext2) await autoSaveToDocumentsTab(session.userId, urls.ext2, 'DRS Online Training — Part 2 Certificate', approved)
              } catch {}
            }
          })
          localStorage.setItem(syncKey, '1')
        }
      }
    } catch (e) {
      console.error('LabSafety load error:', e)
    }
    setLoading(false)
  }

  async function approveStep(userId, stepNumber) {
    setSaving(true)
    try {
      // Ensure we always have a valid organization_id — fall back to DB lookup if session is missing it
      let orgId = session.organizationId
      if (!orgId) {
        const { data: u } = await sb.from('users').select('organization_id').eq('id', userId).maybeSingle()
        orgId = u?.organization_id || null
      }
      const prev = progress[userId]?.[stepNumber] || {}
      const { error } = await sb.from('lab_safety_progress').upsert({
        user_id: userId,
        organization_id: orgId,
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
        await setDocApproval(userId, stepNumber, true)
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
        await setDocApproval(userId, stepNumber, false)
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
            {isLabManager
              ? 'Review lab users\' safety training progress and approve each step.'
              : 'Complete all 4 steps — your lab manager will approve each one before you proceed.'}
          </div>
        </div>
      )}

      {isLabUser && selectedUser && (
        <StepPanel
          user={selectedUser}
          progress={progress}
          isLabManager={false}
          onApprove={approveStep}
          onRevoke={revokeStep}
          onCertGenerated={handleCertGenerated}
          saving={saving}
        />
      )}

      {isLabManager && (
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
                isLabManager={true}
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
