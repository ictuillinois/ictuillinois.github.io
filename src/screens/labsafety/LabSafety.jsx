import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { jsPDF } from 'jspdf'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// Required SQL (run once in Supabase SQL Editor):
// ALTER TABLE lab_safety_progress
//   ADD COLUMN IF NOT EXISTS certificate_url TEXT DEFAULT NULL,
//   ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT NULL;

// ── Step configuration ─────────────────────────────────────────────────────
const STEPS = [
  {
    number: 1,
    title: 'Step 1',
    icon: '📋',
    description: 'Read ICT Safety Part I & receive certificate',
    type: 'pdf_safety_part1',
    content: null,
  },
  {
    number: 2,
    title: 'Step 2',
    icon: '🎬',
    description: 'Required training video',
    type: 'placeholder',
    content: null,
  },
  {
    number: 3,
    title: 'Step 3',
    icon: '📝',
    description: 'Policy review and acknowledgment',
    type: 'placeholder',
    content: null,
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

// ── Step 1: PDF Safety Training + Certificate Generation ───────────────────

function CompletionPopup({ onGenerate, onClose, generating }) {
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
        <div style={{ fontWeight: 700, fontSize: 20, color: '#085041', marginBottom: 8 }}>Part 1 Completed!</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 24 }}>
          You've successfully read through all 46 slides of the<br />
          <strong>ICT Health and Safety Program Part I</strong>.<br />
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

function Step1PDFContent({ user, isManager, stepRow, onCertGenerated }) {
  const { session } = useAppStore()

  // PDF viewer state
  const [pdfDoc, setPdfDoc] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loadingPDF, setLoadingPDF] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [showCompletion, setShowCompletion] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)

  const storageKey = `ictlab_step1_done_${user?.id}`
  const [hasReachedEnd, setHasReachedEnd] = useState(() => !!localStorage.getItem(storageKey))

  const canvasRef = useRef(null)
  const renderTaskRef = useRef(null)
  const containerRef = useRef(null)

  // Load PDF when viewer opens
  useEffect(() => {
    if (!viewerOpen || pdfDoc) return
    let cancelled = false
    async function init() {
      setLoadingPDF(true)
      setPdfError(null)
      try {
        const doc = await pdfjsLib.getDocument('/ict-safety-part1.pdf').promise
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

  // Render page on canvas whenever currentPage changes
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

        const containerW = containerRef.current?.clientWidth || 680
        const baseVP = page.getViewport({ scale: 1 })
        const scale = Math.min(containerW / baseVP.width, 1.8)
        const viewport = page.getViewport({ scale })

        const canvas = canvasRef.current
        canvas.width = viewport.width
        canvas.height = viewport.height

        const task = page.render({ canvasContext: canvas.getContext('2d'), viewport })
        renderTaskRef.current = task
        await task.promise
        renderTaskRef.current = null
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') console.error(e)
      }
      if (!cancelled) setRendering(false)
    }
    render()
    return () => { cancelled = true }
  }, [pdfDoc, currentPage, viewerOpen])

  function goToPage(n) {
    if (!pdfDoc || n < 1 || n > totalPages) return
    setCurrentPage(n)
    if (n === totalPages) {
      localStorage.setItem(storageKey, '1')
      setHasReachedEnd(true)
      setShowCompletion(true)
    }
  }

  async function generateCertificate() {
    setGenerating(true)
    setGenError(null)
    try {
      const firstName = user.nick_name?.trim() || user.name || ''
      const lastName = user.last_name || ''
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Student'
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

      // Generate certificate PDF
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth()   // 297
      const H = doc.internal.pageSize.getHeight()  // 210

      // White background
      doc.setFillColor(255, 255, 255)
      doc.rect(0, 0, W, H, 'F')

      // Outer border (teal double)
      doc.setDrawColor(29, 158, 117)
      doc.setLineWidth(3)
      doc.rect(8, 8, W - 16, H - 16)
      doc.setLineWidth(0.8)
      doc.rect(12, 12, W - 24, H - 24)

      // Corner accents
      const cs = 12
      doc.setFillColor(29, 158, 117)
      ;[[8,8],[W-8,8],[8,H-8],[W-8,H-8]].forEach(([cx, cy]) => {
        doc.circle(cx, cy, 4, 'F')
      })

      // Teal header band
      doc.setFillColor(8, 80, 65)
      doc.rect(8, 8, W - 16, 32, 'F')

      // Header text
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      doc.text('CERTIFICATE OF COMPLETION', W / 2, 22, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.text('ICT LABORATORY SAFETY PROGRAM  ·  FALL 2025', W / 2, 32, { align: 'center' })

      // "This certifies that"
      doc.setTextColor(80, 80, 80)
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(13)
      doc.text('This certifies that', W / 2, 60, { align: 'center' })

      // Student name
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(30)
      doc.setTextColor(29, 158, 117)
      doc.text(fullName, W / 2, 80, { align: 'center' })

      // Underline under name
      const nameW = doc.getTextWidth(fullName)
      doc.setDrawColor(29, 158, 117)
      doc.setLineWidth(0.6)
      doc.line(W / 2 - nameW / 2 - 8, 84, W / 2 + nameW / 2 + 8, 84)

      // "has successfully completed"
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(13)
      doc.setTextColor(80, 80, 80)
      doc.text('has successfully completed', W / 2, 96, { align: 'center' })

      // Training program name
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(20, 20, 20)
      doc.text('ICT Health and Safety Program Part I — All ICT Users', W / 2, 108, { align: 'center' })

      // Sub-description
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(100, 100, 100)
      doc.text('Covering RAMP Risk Assessment, PPE, Emergency Procedures & ICT Laboratory Policies', W / 2, 117, { align: 'center' })

      // Date
      doc.setFontSize(12)
      doc.setTextColor(60, 60, 60)
      doc.text(`Date of Completion:  ${dateStr}`, W / 2, 132, { align: 'center' })

      // Separator
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.4)
      doc.line(W * 0.15, 142, W * 0.85, 142)

      // Signature lines
      const sigY = H - 34
      doc.setDrawColor(100, 100, 100)
      doc.setLineWidth(0.5)
      const lineLen = 60
      doc.line(W * 0.25 - lineLen/2, sigY, W * 0.25 + lineLen/2, sigY)
      doc.line(W * 0.75 - lineLen/2, sigY, W * 0.75 + lineLen/2, sigY)
      doc.setFontSize(10)
      doc.setTextColor(120, 120, 120)
      doc.text('Student Signature', W * 0.25, sigY + 5, { align: 'center' })
      doc.text('Lab Manager / Instructor', W * 0.75, sigY + 5, { align: 'center' })

      // Footer band
      doc.setFillColor(29, 158, 117)
      doc.rect(8, H - 22, W - 16, 14, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.text('ICT Laboratory · College of Engineering · University of Missouri', W / 2, H - 13, { align: 'center' })

      // Upload to Supabase
      const blob = doc.output('blob')
      const fileName = `safety-certs/part1/${user.id}-${Date.now()}.pdf`
      const { error: upErr } = await sb.storage
        .from('project-files')
        .upload(fileName, blob, { contentType: 'application/pdf', upsert: false })

      let certUrl = null
      if (!upErr) {
        const { data: urlData } = sb.storage.from('project-files').getPublicUrl(fileName)
        certUrl = urlData?.publicUrl
      }

      // Save to lab_safety_progress
      await sb.from('lab_safety_progress').upsert({
        user_id: user.id,
        organization_id: session.organizationId,
        step_number: 1,
        completed: false,
        certificate_url: certUrl,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'user_id,step_number' })

      // Trigger download
      doc.save(`ICT-Safety-Part1-${fullName.replace(/\s+/g, '-')}.pdf`)

      setShowCompletion(false)
      onCertGenerated({ certificate_url: certUrl, submitted_at: new Date().toISOString() })
    } catch (e) {
      console.error('Certificate error:', e)
      setGenError('Failed to submit certificate. Please try again.')
    }
    setGenerating(false)
  }

  const hasCert = !!stepRow?.certificate_url
  const isApproved = !!stepRow?.completed

  // ── Manager view ──
  if (isManager) {
    return (
      <div>
        <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          Lab users must read the <strong>ICT Health and Safety Program Part I</strong> presentation (46 slides).
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
      {/* Intro */}
      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
        Read all <strong>46 slides</strong> of the <strong>ICT Health and Safety Program Part I</strong>.
        When you reach the last slide, a certificate will be generated for your lab manager to approve.
      </div>

      {/* Already submitted */}
      {hasCert ? (
        <div style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 10, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#085041', marginBottom: 4 }}>
              {isApproved ? '✓ Step 1 approved by your lab manager!' : '✓ Certificate submitted — awaiting lab manager approval'}
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
            View My Certificate ↗
          </a>
        </div>
      ) : (
        <>
          {/* PDF viewer toggle */}
          {!viewerOpen ? (
            <div style={{ marginBottom: 12 }}>
              <button
                onClick={() => setViewerOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 22px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                <span style={{ fontSize: 20 }}>📖</span>
                {hasReachedEnd ? 'Review Training Material' : 'Open Safety Training — Part I (46 slides)'}
              </button>
              {hasReachedEnd && (
                <div style={{ marginTop: 10, fontSize: 13, color: '#085041', fontWeight: 600 }}>
                  ✓ You've reached the last slide. Generate your certificate below.
                </div>
              )}
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
              {/* PDF canvas area */}
              <div ref={containerRef} style={{ background: '#525659', padding: 12, minHeight: 200, position: 'relative' }}>
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
                <canvas
                  ref={canvasRef}
                  style={{ display: pdfDoc ? 'block' : 'none', margin: '0 auto', maxWidth: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', borderRadius: 2 }}
                />
                {rendering && (
                  <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                    Loading…
                  </div>
                )}
              </div>

              {/* Navigation bar */}
              {pdfDoc && (
                <div style={{ background: 'var(--surface2)', borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: currentPage <= 1 ? 'default' : 'pointer', opacity: currentPage <= 1 ? 0.4 : 1, fontFamily: 'var(--sans)' }}
                  >
                    ← Prev
                  </button>

                  <div style={{ flex: 1 }}>
                    {/* Progress bar */}
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 4 }}>
                      <div style={{ width: `${(currentPage / totalPages) * 100}%`, height: '100%', background: '#1D9E75', borderRadius: 2, transition: 'width 0.2s' }} />
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>
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
                </div>
              )}

              {/* Close viewer */}
              <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '8px 16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setViewerOpen(false)}
                  style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', padding: '4px 8px' }}
                >
                  Close viewer
                </button>
              </div>
            </div>
          )}

          {/* Generate certificate button when end has been reached */}
          {hasReachedEnd && (
            <div style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 10, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#085041', marginBottom: 8 }}>
                ✅ You've read all 46 slides!
              </div>
              <div style={{ fontSize: 13, color: '#085041', marginBottom: 12, lineHeight: 1.6 }}>
                Your completion certificate is ready. Click below to generate it and submit to your lab manager.
              </div>
              {genError && (
                <div style={{ marginBottom: 10, fontSize: 13, color: '#c84b2f', background: '#fef2f2', borderRadius: 6, padding: '8px 12px' }}>
                  {genError}
                </div>
              )}
              <button
                onClick={generateCertificate}
                disabled={generating}
                style={{ padding: '10px 22px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.7 : 1 }}
              >
                {generating ? '⏳ Generating…' : '📜 Generate & Submit Certificate'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Completion popup overlay */}
      {showCompletion && (
        <CompletionPopup
          generating={generating}
          onGenerate={generateCertificate}
          onClose={() => setShowCompletion(false)}
        />
      )}
    </div>
  )
}

// ── Step 4: ICT Safety Video ───────────────────────────────────────────────

function Step4VideoContent({ userId, isManager }) {
  const clickKey   = `ictlab_safety4_clicked_${userId}`
  const confirmKey = `ictlab_safety4_confirmed_${userId}`
  const [url, setUrl]                 = useState('')
  const [hasClicked, setHasClicked]   = useState(() => !!localStorage.getItem(clickKey))
  const [confirmed, setConfirmed]     = useState(() => !!localStorage.getItem(confirmKey))
  const [editingUrl, setEditingUrl]   = useState(false)
  const [urlInput, setUrlInput]       = useState('')
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    sb.from('settings').select('value').eq('key', 'labsafety_url').maybeSingle()
      .then(({ data }) => { if (data?.value) { setUrl(data.value); setUrlInput(data.value) } })
  }, [])

  function handleWatch() {
    if (!url) return
    localStorage.setItem(clickKey, '1')
    setHasClicked(true)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function handleConfirm(e) {
    const checked = e.target.checked
    setConfirmed(checked)
    if (checked) localStorage.setItem(confirmKey, '1')
    else localStorage.removeItem(confirmKey)
  }

  async function saveUrl() {
    if (!urlInput.trim()) return
    setSaving(true)
    await sb.from('settings').upsert({ key: 'labsafety_url', value: urlInput.trim() }, { onConflict: 'key' })
    setUrl(urlInput.trim())
    setEditingUrl(false)
    setSaving(false)
  }

  return (
    <div>
      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 20, marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 14 }}>
          Watch the required ICT Laboratory Safety Video. After watching, return here and check the confirmation box so your lab manager can approve this step.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={handleWatch} disabled={!url}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: url ? 'pointer' : 'default', opacity: url ? 1 : 0.5 }}>
            Watch ICT Safety Video ↗
          </button>
          {isManager && !editingUrl && (
            <button onClick={() => setEditingUrl(true)}
              style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'var(--sans)', textDecoration: 'underline' }}>
              {url ? 'Edit URL' : 'Set video URL'}
            </button>
          )}
        </div>
        {isManager && editingUrl && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://..." autoFocus
              style={{ flex: 1, minWidth: 200, fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
            <button onClick={saveUrl} disabled={saving || !urlInput.trim()}
              style={{ padding: '7px 16px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setEditingUrl(false); setUrlInput(url) }}
              style={{ padding: '7px 12px', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}
      </div>
      {!isManager && (hasClicked ? (
        <div style={{ background: confirmed ? '#E1F5EE' : 'var(--surface2)', border: `1px solid ${confirmed ? '#9FE1CB' : 'var(--border)'}`, borderRadius: 8, padding: '12px 16px', transition: 'all 0.2s' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: confirmed ? '#085041' : 'var(--text)', fontWeight: confirmed ? 600 : 400 }}>
            <input type="checkbox" checked={confirmed} onChange={handleConfirm}
              style={{ width: 16, height: 16, accentColor: '#1D9E75', cursor: 'pointer' }} />
            I confirm I have watched the ICT safety video
          </label>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
          After clicking the link above, a confirmation checkbox will appear here.
        </div>
      ))}
    </div>
  )
}

// ── Step content renderer ──────────────────────────────────────────────────

function StepContentArea({ step, user, isManager, stepRow, onCertGenerated }) {
  if (step.type === 'pdf_safety_part1') {
    return (
      <Step1PDFContent
        user={user}
        isManager={isManager}
        stepRow={stepRow}
        onCertGenerated={onCertGenerated}
      />
    )
  }

  if (step.type === 'ict_video') {
    return <Step4VideoContent userId={user?.id} isManager={isManager} />
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
  const { setScreen } = useAppStore()
  const [activeStep, setActiveStep] = useState(1)
  const userProg = progress[user?.id] || {}
  const allApproved = STEPS.every(s => userProg[s.number]?.completed)

  if (!user) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>

      {/* Tab bar */}
      <div style={{ display: 'flex', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        {STEPS.map(s => {
          const done = !!userProg[s.number]?.completed
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
        const done = !!userProg[s.number]?.completed
        const stepRow = userProg[s.number] || null

        return (
          <div key={s.number} style={{ padding: 24 }}>
            {/* Step header */}
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

            {/* Step content area */}
            <div style={{ marginBottom: 20 }}>
              <StepContentArea
                step={s}
                user={user}
                isManager={isStaff}
                stepRow={stepRow}
                onCertGenerated={extra => onCertGenerated(user.id, s.number, extra)}
              />
            </div>

            {/* Lab manager: approve / revoke */}
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

      {/* All steps approved — proceed banner */}
      {allApproved && (
        <div style={{ borderTop: '1px solid #9FE1CB', padding: '16px 24px', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#085041' }}>🎉 All 4 steps approved!</div>
            <div style={{ fontSize: 12, color: '#085041', marginTop: 2 }}>
              {isStaff
                ? `${user.nick_name?.trim() || user.name} can now upload their safety certificates in Training Records.`
                : 'You can now upload your safety certificates in Training Records.'}
            </div>
          </div>
          {!isStaff && (
            <button onClick={() => setScreen('training')}
              style={{ padding: '10px 20px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Upload Certificates →
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
  const isStaff = session?.role === 'admin' || session?.role === 'user'
  const isLabUser = session?.role === 'lab_user'

  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  // progress[userId][stepNum] = { completed, certificate_url, submitted_at }
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

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

      {/* ── Lab user view — step panel only ── */}
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

      {/* ── Lab manager / admin view ── */}
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
