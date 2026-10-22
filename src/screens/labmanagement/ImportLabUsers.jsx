import { useState, useEffect, useMemo, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { generateTempPassword } from '../../lib/tempPassword'
import { queueWelcomeEmail } from '../../lib/welcomeEmail'
import { applyDefaultIcons } from '../../lib/defaultIcons'
import { SAFETY_STEPS, requiredSafetySteps, storedSafetySteps } from '../labsafety/safetySteps'
import { IconDownload, IconPlus, IconTrash, IconMail, IconCalendar, IconCheckCircle, IconAlert } from '../../components/Icons'

// Lab Management → Import lab users (ICT-Lab, Oct 2026). Lab managers and
// admins only.
//
//   template (public/lab-users-template.xlsx) → upload → review (edit / remove / add, safety ticks) → confirm
//   → accounts created → email now, or at a chosen date and time → history
//
// Accounts are made by the create-lab-users Edge Function: signUp() from the
// browser is rate-limited per IP, and a list of 50 would stop part-way.
//
// MAX is 50 per file and the page says so. A larger list goes in more files.
//
// Imported lab users approve their own safety steps (users.safety_self_approve,
// a trigger marks a submitted step complete) — the manager made the list.
// People added one at a time on the Lab Users tab still need approval.
//
// History reads: users.import_batch_id (who came in which import), the
// 'welcome' rows of email_notifications_queue (sent / scheduled / failed),
// users.password_set_at (first sign-in and own password), lab_safety_progress.

const MAX = 50
const TZ = 'America/Chicago'
const okEmail = e => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e || '')
let keySeq = 0
const blankRow = () => ({ key: ++keySeq, first: '', last: '', email: '', supervisor: '', s1: true, s2: true, s3: true, yearly: true })

const fmt = iso => iso ? new Date(iso).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
const fmtDay = iso => iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }) : ''

// A Chicago wall-clock date + time → UTC ISO. Two passes settle the offset
// across a daylight-saving change.
function chicagoToIso(date, time) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const want = Date.UTC(y, m - 1, d, hh, mm)
  let t = want
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(t)).map(x => [x.type, x.value]))
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute)
    t += want - shown
  }
  return new Date(t).toISOString()
}
function chicagoParts(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}
const tomorrowNine = () => ({ date: chicagoParts(new Date(Date.now() + 864e5).toISOString()).date, time: '09:00' })

async function callFn(body) {
  const { data, error } = await sb.functions.invoke('create-lab-users', { body })
  if (error) {
    // The function's own message is in the response body
    let msg = error.message, extra = null
    try { extra = await error.context?.json(); if (extra?.error) msg = extra.error } catch { /* not JSON */ }
    return { error: msg, data: extra }
  }
  return { data }
}
const kickSender = () => sb.functions.invoke('send-emails', { body: {} }).catch(() => {})

const stepsOf = r => storedSafetySteps([r.s1 && 1, r.s2 && 2, r.s3 && 3].filter(Boolean))
const fullName = u => [u.name ?? u.first, u.last_name ?? u.last].filter(Boolean).join(' ').trim() || u.email

// ═══════════════════════════════════════════════════════════════════════════
export default function ImportLabUsers({ session, toast }) {
  const allowed = session?.role === 'admin' || session?.role === 'user'
  const orgId = session?.organizationId
  // 'history' | 'upload' | 'review' | 'confirm' | 'creating' | 'email'
  const [stage, setStage] = useState('history')
  const [rows, setRows] = useState([])
  const [fileNote, setFileNote] = useState('')
  const [existing, setExisting] = useState(new Set())   // emails that already have an account
  const [checked, setChecked] = useState(new Set())     // emails the server has looked at
  const [created, setCreated] = useState(null)          // { batchId, users: [{ id, email, name, password, required }] , failed }
  const [openBatch, setOpenBatch] = useState(null)
  const [draftId, setDraftId] = useState(null)      // lab_user_imports row with status 'draft'
  const [savingDraft, setSavingDraft] = useState(false)
  const fileRef = useRef(null)

  // ── Ask the server which emails already have an account ─────────────────
  const pending = useMemo(() => [...new Set(rows.map(r => r.email.trim().toLowerCase()).filter(okEmail))].filter(e => !checked.has(e)), [rows, checked])
  useEffect(() => {
    if (!pending.length || !orgId) return
    const t = setTimeout(async () => {
      const { data, error } = await callFn({ action: 'check', orgId, emails: pending })
      if (error) { toast('Could not check for existing accounts: ' + error); return }
      setExisting(s => new Set([...s, ...(data?.existing || [])]))
      setChecked(s => new Set([...s, ...pending]))
    }, 500)
    return () => clearTimeout(t)
  }, [pending.join(','), orgId])

  async function readFile(file) {
    if (!file) return
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
        .map(r => r.map(c => String(c ?? '').trim()))
      // Columns by header text when there is one, else in template order
      let col = { first: 0, last: 1, email: 2, supervisor: 3 }, start = 0
      const head = (grid[0] || []).map(h => h.toLowerCase())
      if (head.some(h => h.includes('mail'))) {
        start = 1
        const find = (...words) => head.findIndex(h => words.some(w => h.includes(w)))
        col = {
          first: find('first'), last: find('last'), email: find('mail'),
          supervisor: find('director', 'advisor', 'adviser', 'supervisor', 'manager'),
        }
        if (col.first < 0) col.first = 0
      }
      const pick = (r, i) => (i >= 0 ? r[i] || '' : '')
      const list = grid.slice(start)
        .map(r => ({ ...blankRow(), first: pick(r, col.first), last: pick(r, col.last), email: pick(r, col.email).toLowerCase(), supervisor: pick(r, col.supervisor) }))
        .filter(r => r.first || r.last || r.email)
      if (!list.length) { toast('No lab users found in that file.'); return }
      if (list.length > MAX) {
        setFileNote(`This file has ${list.length} lab users. The limit is ${MAX} per file — split the list into files of ${MAX} or fewer and import each one.`)
        return
      }
      setFileNote('')
      setRows(list)
      setStage('review')
    } catch (e) {
      toast('Could not read that file: ' + (e.message || 'is it an .xlsx?'))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Problems per row; any problem blocks Add ─────────────────────────────
  const counts = {}
  rows.forEach(r => { const e = r.email.trim().toLowerCase(); if (e) counts[e] = (counts[e] || 0) + 1 })
  const problem = r => {
    const e = r.email.trim().toLowerCase()
    if (!r.first.trim() && !r.last.trim()) return 'name missing'
    if (!okEmail(e)) return e ? 'email is not valid' : 'email missing'
    if (counts[e] > 1) return 'same email twice in this list'
    if (existing.has(e)) return 'already has an ICT-Lab account — remove the row or change the email'
    return null
  }
  const bad = rows.filter(problem).length
  const stillChecking = pending.length > 0
  const set = (key, patch) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r))
  const colAll = f => rows.length > 0 && rows.every(r => r[f])
  const setCol = (f, v) => setRows(rs => rs.map(r => ({ ...r, [f]: v })))

  // Save the unfinished list in the database (no accounts, no passwords), so
  // any lab manager or admin of the org can finish it later, from any computer.
  async function saveDraft() {
    setSavingDraft(true)
    const row = {
      organization_id: orgId, status: 'draft', user_count: rows.length,
      draft_rows: rows.map(({ key, ...r }) => r), updated_at: new Date().toISOString(),
      created_by: session?.userId || null, created_by_name: session?.username || 'Lab manager',
    }
    const { data, error } = draftId
      ? await sb.from('lab_user_imports').update(row).eq('id', draftId).select('id')
      : await sb.from('lab_user_imports').insert(row).select('id')
    setSavingDraft(false)
    if (error || !data?.length) { toast('Could not save the list: ' + (error?.message || 'nothing was saved')); return }
    setDraftId(data[0].id)
    toast(`List saved (${rows.length} lab users) — nobody was added and no email was sent. Continue any time from Import lab users.`)
    setStage('history')
  }

  function continueDraft(d) {
    setRows((d.draft_rows || []).map(r => ({ ...blankRow(), ...r })))
    setExisting(new Set()); setChecked(new Set()); setCreated(null); setFileNote('')
    setDraftId(d.id)
    setStage('review')
  }

  async function create() {
    setStage('creating')
    const withPw = rows.map(r => ({ ...r, password: generateTempPassword() }))
    const { data, error } = await callFn({
      action: 'create', orgId,
      users: withPw.map(r => ({
        first: r.first, last: r.last, email: r.email.trim().toLowerCase(), supervisor: r.supervisor,
        password: r.password, required_safety_steps: stepsOf(r), annual_resafety: r.yearly,
      })),
    })
    if (error) {
      if (data?.existing?.length) { setExisting(s => new Set([...s, ...data.existing])); setStage('review') }
      else setStage('confirm')
      toast(error)
      return
    }
    const byEmail = Object.fromEntries(withPw.map(r => [r.email.trim().toLowerCase(), r]))
    const users = (data.created || []).map(c => ({ id: c.id, email: c.email, name: fullName(byEmail[c.email]), password: byEmail[c.email].password, required: stepsOf(byEmail[c.email]) }))
    for (const u of users) await applyDefaultIcons(u.id, orgId, 'lab_user')
    if (draftId && users.length) { await sb.from('lab_user_imports').delete().eq('id', draftId); setDraftId(null) }
    setCreated({ batchId: data.batchId, users, failed: data.failed || [] })
    setStage(users.length ? 'email' : 'review')
    if (!users.length) toast('No lab users were added — see the reasons in the list.')
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (!allowed) return <div className="empty-state">Only lab managers and admins can import lab users.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {stage === 'history' && (
        <History orgId={orgId} toast={toast} openBatch={openBatch} setOpenBatch={setOpenBatch} onContinue={continueDraft}
          onNew={() => { setRows([]); setExisting(new Set()); setChecked(new Set()); setCreated(null); setFileNote(''); setDraftId(null); setStage('upload') }} />
      )}

      {stage === 'upload' && (
        <>
          <LimitNote />
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>1 · Download the template and fill it in</div>
              {/* A real file on the site (public/), not one built in the
                  browser: people download it, fill it in, upload it back. */}
              <a className="btn btn-sm" href="/lab-users-template.xlsx" download="ICT-Lab lab users template.xlsx" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                <IconDownload size={15} /> Download template (.xlsx)
              </a>
            </div>
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>2 · Upload the filled template</div>
            <div onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files?.[0]) }}
              style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>
              Drop the filled template here, or <span style={{ color: 'var(--accent)', fontWeight: 600 }}>choose a file…</span>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>.xlsx · the first sheet is read · up to {MAX} lab users</div>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => readFile(e.target.files?.[0])} />
            {fileNote && <Warn>{fileNote}</Warn>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={() => { setRows([blankRow()]); setStage('review') }}>Type the list instead</button>
              <button className="btn btn-sm" onClick={() => setStage('history')}>Back to history</button>
            </div>
          </div>
        </>
      )}

      {stage === 'review' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Review the list</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
              Edit any cell, remove a row, or add one. Tick the safety steps each person must do — the
              ticks in the header set the whole column. A step that is not ticked is not required.
            </div>
          </div>
          {created?.failed?.length > 0 && (
            <Warn>Not added: {created.failed.map(f => `${f.email} (${f.error})`).join('; ')}</Warn>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>First name</th><th style={th}>Last name</th><th style={th}>Email</th><th style={th}>Supervisor</th>
                  {[['s1', 'Step 1'], ['s2', 'Step 2'], ['s3', 'Step 3'], ['yearly', 'Yearly re-safety']].map(([f, l]) => (
                    <th key={f} style={{ ...th, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <label style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
                        {l}<input type="checkbox" checked={colAll(f)} onChange={e => setCol(f, e.target.checked)} style={{ width: 'auto' }} />
                      </label>
                    </th>
                  ))}
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const p = problem(r)
                  const e = r.email.trim().toLowerCase()
                  return [
                    <tr key={r.key} style={p ? { background: '#fdf1ee' } : undefined}>
                      <td style={td}><input value={r.first} maxLength={60} onChange={ev => set(r.key, { first: ev.target.value })} style={cell} /></td>
                      <td style={td}><input value={r.last} maxLength={60} onChange={ev => set(r.key, { last: ev.target.value })} style={cell} /></td>
                      <td style={td}><input value={r.email} maxLength={120} onChange={ev => set(r.key, { email: ev.target.value })} style={{ ...cell, minWidth: 200, borderColor: p && p !== 'name missing' ? '#c84b2f' : undefined }} /></td>
                      <td style={td}><input value={r.supervisor} maxLength={120} onChange={ev => set(r.key, { supervisor: ev.target.value })} style={{ ...cell, minWidth: 160 }} /></td>
                      {['s1', 's2', 's3', 'yearly'].map(f => (
                        <td key={f} style={{ ...td, textAlign: 'center' }}>
                          <input type="checkbox" checked={r[f]} onChange={ev => set(r.key, { [f]: ev.target.checked })} style={{ width: 'auto' }} />
                        </td>
                      ))}
                      <td style={td}>
                        <button className="btn" title="Remove this row" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} style={{ padding: '4px 8px', display: 'inline-flex' }}>
                          <IconTrash size={14} />
                        </button>
                      </td>
                    </tr>,
                    (p || (okEmail(e) && !checked.has(e))) && (
                      <tr key={r.key + '-p'} style={p ? { background: '#fdf1ee' } : undefined}>
                        <td colSpan={9} style={{ ...td, paddingTop: 0, fontSize: 12, color: p ? '#c84b2f' : 'var(--text3)' }}>
                          {p || 'checking for an existing account…'}
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" disabled={rows.length >= MAX} onClick={() => setRows(rs => [...rs, blankRow()])} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <IconPlus size={14} /> Add a lab user
            </button>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{rows.length} of {MAX} per import</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
            {SAFETY_STEPS.map(s => s.label).join(' · ')} · <strong>Yearly re-safety</strong> — on Sep 1 every year
            all three steps reset and ICT-Lab locks for this person until they pass them again.
          </div>
          {bad > 0 && <Warn>{bad} row{bad !== 1 ? 's need' : ' needs'} fixing before the list can be added.</Warn>}
          <NothingSentNote>
            <strong>Nothing is sent yet.</strong> “Add {rows.length} lab user{rows.length !== 1 ? 's' : ''}” opens a confirm page —
            accounts are made only when you confirm there, and after that you choose when the welcome
            email goes out (now, or a date and time). Not finished? <strong>Save and finish later</strong> keeps
            this list for you and the other lab managers.
          </NothingSentNote>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={!rows.length || bad > 0 || stillChecking} onClick={() => setStage('confirm')}>
              {stillChecking ? 'Checking emails…' : `Add ${rows.length} lab user${rows.length !== 1 ? 's' : ''}`}
            </button>
            <button className="btn" disabled={!rows.length || savingDraft} onClick={saveDraft}>
              {savingDraft ? 'Saving…' : draftId ? 'Save changes and finish later' : 'Save and finish later'}
            </button>
            <button className="btn" onClick={() => setStage(draftId ? 'history' : 'upload')}>{draftId ? 'Back to history' : 'Start over'}</button>
          </div>
        </div>
      )}

      {(stage === 'confirm' || stage === 'creating') && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Add {rows.length} lab user{rows.length !== 1 ? 's' : ''} to ICT-Lab?</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
            {(() => {
              const all = rows.filter(r => r.s1 && r.s2 && r.s3).length
              const none = rows.filter(r => !r.s1 && !r.s2 && !r.s3).length
              const some = rows.length - all - none
              const yearly = rows.filter(r => r.yearly).length
              return [
                all > 0 && <li key="a">{all} must do all three safety steps</li>,
                some > 0 && <li key="s">{some} must do some of the steps</li>,
                none > 0 && <li key="n">{none} need no safety training</li>,
                <li key="y">{yearly} redo all three steps every Sep 1 (yearly re-safety)</li>,
              ]
            })()}
          </ul>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            Each gets an ICT-Lab account with a temporary password and chooses their own at first sign-in.
            The safety steps they complete count as approved straight away — no lab manager approval,
            because you made this list.
          </div>
          <NothingSentNote>
            <strong>No email is sent on this page.</strong> Next you choose: send the welcome emails now, or on a
            date and time you pick.
          </NothingSentNote>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={stage === 'creating'} onClick={create}>
              {stage === 'creating' ? `Adding ${rows.length}…` : 'Yes, add them'}
            </button>
            <button className="btn" disabled={stage === 'creating'} onClick={() => setStage('review')}>Back to the list</button>
          </div>
        </div>
      )}

      {stage === 'email' && created && (
        <EmailStep created={created} orgId={orgId} toast={toast}
          onDone={batchId => { setCreated(null); setRows([]); setOpenBatch(batchId); setStage('history') }} />
      )}
    </div>
  )
}

const th = { textAlign: 'left', padding: '8px 6px', fontSize: 12, fontWeight: 700, color: 'var(--text2)', borderBottom: '1px solid var(--border)' }
const td = { padding: '4px 6px', verticalAlign: 'middle' }
const cell = { width: '100%', minWidth: 110, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }

function Warn({ children }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#7a4a00', background: '#fff7e6', border: '1px solid #f1d49b', borderRadius: 8, padding: '8px 12px', lineHeight: 1.5 }}>
      <IconAlert size={16} style={{ marginTop: 2 }} /><div>{children}</div>
    </div>
  )
}

function NothingSentNote({ children }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', lineHeight: 1.5 }}>
      <IconMail size={16} style={{ marginTop: 2, color: 'var(--text3)' }} /><div>{children}</div>
    </div>
  )
}

function LimitNote() {
  return (
    <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--accent-light)', border: '1px solid #9FE1CB', borderRadius: 8, padding: '8px 12px', lineHeight: 1.5 }}>
      <strong style={{ color: '#085041' }}>Up to {MAX} lab users per file.</strong> For a longer list, split it into
      several files and import each one — every import is listed in the history.
    </div>
  )
}

// ── Email now, or at a date and time ─────────────────────────────────────
// Used right after the accounts are made, and again from the history for an
// import whose emails were never sent ("Save and finish later").
function SendChooser({ count, busy, progress, onSend, toast, children }) {
  const [mode, setMode] = useState('now')
  const [when, setWhen] = useState(tomorrowNine)
  function go() {
    if (mode === 'now') { onSend(null); return }
    if (!when.date || !when.time) { toast('Pick a date and a time.'); return }
    const iso = chicagoToIso(when.date, when.time)
    if (new Date(iso) <= new Date()) { toast('That time has already passed — pick a later one.'); return }
    onSend(iso)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={radio}><input type="radio" checked={mode === 'now'} onChange={() => setMode('now')} style={{ width: 'auto' }} /> Yes, send now</label>
      <label style={radio}><input type="radio" checked={mode === 'later'} onChange={() => setMode('later')} style={{ width: 'auto' }} /> No — send it later, on a date and time I choose</label>
      {mode === 'later' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', paddingLeft: 24 }}>
          <div className="field" style={{ margin: 0 }}><label>Date</label><input type="date" value={when.date} onChange={e => setWhen(w => ({ ...w, date: e.target.value }))} /></div>
          <div className="field" style={{ margin: 0 }}><label>Time</label><input type="time" value={when.time} onChange={e => setWhen(w => ({ ...w, time: e.target.value }))} /></div>
          <span style={{ fontSize: 12, color: 'var(--text3)', paddingBottom: 8 }}>Chicago time</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy} onClick={go} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {mode === 'now' ? <IconMail size={16} /> : <IconCalendar size={16} />}
          {busy ? (progress || 'Queuing…') : mode === 'now' ? `Send ${count} email${count !== 1 ? 's' : ''} now` : 'Schedule the emails'}
        </button>
        {children}
      </div>
    </div>
  )
}

function EmailStep({ created, orgId, toast, onDone }) {
  const [busy, setBusy] = useState(false)
  const n = created.users.length

  async function send(sendAfter) {
    setBusy(true)
    let failed = 0
    for (const u of created.users) {
      const err = await queueWelcomeEmail(sb, { name: u.name, toEmail: u.email, orgId, userId: u.id, password: u.password, sendAfter, required: u.required, selfApprove: true })
      if (err) failed++
    }
    await sb.from('lab_user_imports').update({ email_send_at: sendAfter || new Date().toISOString() }).eq('id', created.batchId)
    if (!sendAfter) kickSender()
    setBusy(false)
    toast(failed ? `${n - failed} of ${n} emails queued — use Resend in the history for the rest.`
      : sendAfter ? `Welcome emails scheduled for ${fmt(sendAfter)} (Chicago time).` : 'Welcome emails are on their way.')
    onDone(created.batchId)
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 17, color: '#085041' }}>
        <IconCheckCircle size={20} /> {n} lab user{n !== 1 ? 's' : ''} added — send their welcome email now?
      </div>
      {created.failed.length > 0 && <Warn>Not added: {created.failed.map(f => `${f.email} (${f.error})`).join('; ')}</Warn>}
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
        The email has the ICT-Lab address, their sign-in email and temporary password, and what to do first.
      </div>
      <SendChooser count={n} busy={busy} onSend={send} toast={toast}>
        <button className="btn" disabled={busy} onClick={() => {
          toast(`${n} lab user${n !== 1 ? 's' : ''} added — no email sent yet. Send it any time from this import in the history.`)
          onDone(created.batchId)
        }}>Save and finish later</button>
      </SendChooser>
      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
        Save and finish later: the accounts stay, nobody is emailed, and this import's
        “Send welcome emails” button in the history picks up from here.
      </div>
    </div>
  )
}
const radio = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }

// ── History: every import, newest first ─────────────────────────────────
function History({ orgId, toast, onNew, onContinue, openBatch, setOpenBatch }) {
  const [batches, setBatches] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [dropping, setDropping] = useState(null)   // draft id awaiting "Delete?" confirmation
  const [people, setPeople] = useState({})   // batchId → users rows
  const [mail, setMail] = useState({})       // userId → latest welcome row
  const [done, setDone] = useState({})       // userId → Set of completed step numbers
  const [busy, setBusy] = useState(null)
  const [moving, setMoving] = useState(null) // { batchId, date, time }
  const [notSetUp, setNotSetUp] = useState(false)
  const [sending, setSending] = useState(null)  // batch id whose send chooser is open
  const [progress, setProgress] = useState('')

  useEffect(() => { load() }, [orgId])

  async function load() {
    if (!orgId) { setBatches([]); return }
    const { data: bs, error } = await sb.from('lab_user_imports').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(20)
    // Before lab_user_import_setup.sql has run in this database
    if (error && (error.code === 'PGRST205' || error.code === '42P01' || /schema cache|does not exist/i.test(error.message || ''))) {
      setNotSetUp(true); setBatches([]); return
    }
    if (error) { toast('Could not load the import history: ' + error.message); setBatches([]); return }
    // Saved, unfinished lists sit in the same table with status 'draft'
    setDrafts((bs || []).filter(b => b.status === 'draft'))
    const done = (bs || []).filter(b => b.status !== 'draft')
    setBatches(done)
    const ids = done.map(b => b.id)
    if (!ids.length) return
    const { data: us } = await sb.from('users').select('*').in('import_batch_id', ids).order('name')
    const byBatch = {}
    ;(us || []).forEach(u => { (byBatch[u.import_batch_id] ||= []).push(u) })
    setPeople(byBatch)
    const uids = (us || []).map(u => u.id)
    if (!uids.length) return
    const [{ data: q }, { data: prog }] = await Promise.all([
      sb.from('email_notifications_queue').select('id, user_id, sent, sent_at, send_after, error, attempts, created_at').eq('type', 'welcome').in('user_id', uids).order('created_at'),
      sb.from('lab_safety_progress').select('user_id, step_number, completed').in('user_id', uids),
    ])
    const m = {}; (q || []).forEach(r => { m[r.user_id] = r })   // ordered → last wins
    setMail(m)
    const d = {}; (prog || []).forEach(p => { if (p.completed) (d[p.user_id] ||= new Set()).add(p.step_number) })
    setDone(d)
  }

  const mailState = u => {
    const r = mail[u.id]
    if (!r) return { label: 'Not sent', tone: 'muted', resend: true }
    if (r.sent) return { label: `Sent ${fmtDay(r.sent_at)}`, tone: 'ok' }
    if (r.attempts >= 5) return { label: 'Failed' + (r.error ? ` — ${r.error.slice(0, 60)}` : ''), tone: 'bad', resend: true }
    if (r.send_after && new Date(r.send_after) > new Date()) return { label: `Scheduled ${fmt(r.send_after)}`, tone: 'muted', scheduled: true }
    return { label: r.error ? 'Retrying…' : 'Sending…', tone: 'muted' }
  }
  const signedIn = u => u.password_set_at || u.must_change_password === false

  async function resend(u) {
    setBusy(u.id)
    const password = generateTempPassword()
    const { error } = await callFn({ action: 'reset', orgId, userId: u.id, password })
    if (error) { toast(error); setBusy(null); return }
    const err = await queueWelcomeEmail(sb, { name: fullName(u), toEmail: u.email, orgId, userId: u.id, password, required: u.required_safety_steps, selfApprove: !!u.safety_self_approve })
    if (err) toast('Could not queue the email: ' + err.message)
    else { kickSender(); toast(`New welcome email (with a new temporary password) sent to ${u.email}.`) }
    setBusy(null); load()
  }

  // Welcome emails for everyone in an import who was never emailed (the
  // manager chose "Save and finish later"). Their first temporary password
  // was never shown to anyone, so each gets a new one with the email.
  async function sendBatch(b, people, sendAfter) {
    setBusy(b.id)
    let ok = 0, failed = 0
    for (let i = 0; i < people.length; i++) {
      const u = people[i]
      setProgress(`Preparing ${i + 1} of ${people.length}…`)
      const password = generateTempPassword()
      const { error } = await callFn({ action: 'reset', orgId, userId: u.id, password })
      if (error) { failed++; continue }
      const err = await queueWelcomeEmail(sb, { name: fullName(u), toEmail: u.email, orgId, userId: u.id, password, sendAfter, required: u.required_safety_steps, selfApprove: !!u.safety_self_approve })
      if (err) failed++; else ok++
    }
    if (ok) {
      await sb.from('lab_user_imports').update({ email_send_at: sendAfter || new Date().toISOString() }).eq('id', b.id)
      if (!sendAfter) kickSender()
    }
    setBusy(null); setProgress(''); setSending(null)
    toast((sendAfter ? `${ok} email${ok !== 1 ? 's' : ''} scheduled for ${fmt(sendAfter)} (Chicago time).` : `${ok} welcome email${ok !== 1 ? 's' : ''} on their way.`)
      + (failed ? ` ${failed} could not be prepared — use Send email on their rows.` : ''))
    load()
  }

  // Move every unsent welcome email of this import — to now, or a new time
  async function reschedule(batchId, iso) {
    const ids = (people[batchId] || []).map(u => u.id)
    if (!ids.length) return
    setBusy(batchId)
    const { data, error } = await sb.from('email_notifications_queue').update({ send_after: iso })
      .eq('type', 'welcome').eq('sent', false).lt('attempts', 5).in('user_id', ids).select('id')
    if (error || !data?.length) toast(error ? 'Could not change the time: ' + error.message : 'There were no unsent emails to change.')
    else {
      await sb.from('lab_user_imports').update({ email_send_at: iso }).eq('id', batchId)
      if (new Date(iso) <= new Date()) kickSender()
      toast(new Date(iso) <= new Date() ? `${data.length} email${data.length !== 1 ? 's' : ''} sending now.` : `Rescheduled for ${fmt(iso)} (Chicago time).`)
    }
    setBusy(null); setMoving(null); load()
  }

  if (batches === null) return <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (notSetUp) return (
    <Warn>
      Import lab users is not set up in this database yet. An admin needs to run
      <strong> lab_user_import_setup.sql</strong> in Supabase → SQL Editor, and deploy the
      <strong> create-lab-users</strong> Edge Function. Then reload this page.
    </Warn>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>Every import, newest first. Open one to see each person’s email and first sign-in.</div>
        <button className="btn btn-primary btn-sm" onClick={onNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconPlus size={14} /> New import</button>
      </div>
      <LimitNote />
      {drafts.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', border: '1px dashed #f1d49b', background: '#fff7e6', borderRadius: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#7a4a00' }}>Saved list, not added yet · {d.user_count} lab user{d.user_count !== 1 ? 's' : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>saved {fmt(d.updated_at || d.created_at)} by {d.created_by_name || 'a lab manager'} · no accounts made, no email sent</div>
          </div>
          {dropping === d.id ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>Delete this list?</span>
              <button className="btn btn-danger btn-sm" onClick={async () => {
                const { data, error } = await sb.from('lab_user_imports').delete().eq('id', d.id).select('id')
                if (error || !data?.length) toast('Could not delete it: ' + (error?.message || 'nothing was deleted'))
                setDropping(null); load()
              }}>Delete</button>
              <button className="btn btn-sm" onClick={() => setDropping(null)}>Keep</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={() => onContinue(d)}>Continue</button>
              <button className="btn btn-sm" title="Delete this saved list" onClick={() => setDropping(d.id)} style={{ display: 'inline-flex' }}><IconTrash size={14} /></button>
            </div>
          )}
        </div>
      ))}
      {batches.length === 0 && drafts.length === 0 && <div className="empty-state">No imports yet. Start one with “New import”.</div>}
      {batches.map((b, idx) => {
        const us = people[b.id] || []
        const states = us.map(mailState)
        const scheduled = states.some(s => s.scheduled)
        const sentN = states.filter(s => s.tone === 'ok').length
        const inN = us.filter(signedIn).length
        const open = openBatch === b.id
        const neverEmailed = us.filter(u => !mail[u.id] && !signedIn(u) && u.is_active)
        return (
          <div key={b.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)' }}>
            <div onClick={() => setOpenBatch(open ? null : b.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtDay(b.created_at)}, {new Date(b.created_at).getFullYear()} · {us.length} lab user{us.length !== 1 ? 's' : ''}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>by {b.created_by_name || 'a lab manager'}</div>
              </div>
              <span className="badge" style={scheduled ? { background: '#fff7e6', color: '#7a4a00' } : { background: 'var(--accent-light)', color: '#085041' }}>
                {scheduled ? `Email scheduled ${fmt(b.email_send_at)}` : b.email_send_at ? `Email sent ${fmt(b.email_send_at)} · ${sentN}/${us.length}` : 'Email not sent'}
              </span>
              {neverEmailed.length > 0 && sending !== b.id && (
                <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); setSending(b.id) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconMail size={14} /> Send welcome emails ({neverEmailed.length})
                </button>
              )}
              <span className="badge" style={{ background: 'var(--surface)', color: 'var(--text2)', border: '1px solid var(--border)' }}>{inN} of {us.length} signed in</span>
              {scheduled && (
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" disabled={busy === b.id} onClick={() => reschedule(b.id, new Date().toISOString())}>Send now</button>
                  <button className="btn btn-sm" onClick={() => setMoving({ batchId: b.id, ...chicagoParts(b.email_send_at || new Date().toISOString()) })}>Change time</button>
                </div>
              )}
            </div>
            {sending === b.id && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                  {neverEmailed.length} lab user{neverEmailed.length !== 1 ? 's have' : ' has'} not been emailed yet. Each email carries a new temporary password.
                </div>
                <SendChooser count={neverEmailed.length} busy={busy === b.id} progress={progress} toast={toast} onSend={iso => sendBatch(b, neverEmailed, iso)}>
                  <button className="btn" disabled={busy === b.id} onClick={() => setSending(null)}>Not now</button>
                </SendChooser>
              </div>
            )}
            {moving?.batchId === b.id && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', padding: '0 16px 12px' }}>
                <div className="field" style={{ margin: 0 }}><label>Date</label><input type="date" value={moving.date} onChange={e => setMoving(m => ({ ...m, date: e.target.value }))} /></div>
                <div className="field" style={{ margin: 0 }}><label>Time</label><input type="time" value={moving.time} onChange={e => setMoving(m => ({ ...m, time: e.target.value }))} /></div>
                <span style={{ fontSize: 12, color: 'var(--text3)', paddingBottom: 8 }}>Chicago time</span>
                <button className="btn btn-primary btn-sm" disabled={busy === b.id} onClick={() => {
                  const iso = chicagoToIso(moving.date, moving.time)
                  if (new Date(iso) <= new Date()) { toast('That time has already passed — use Send now instead.'); return }
                  reschedule(b.id, iso)
                }}>Save time</button>
                <button className="btn btn-sm" onClick={() => setMoving(null)}>Cancel</button>
              </div>
            )}
            {open && (
              <div style={{ overflowX: 'auto', background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr><th style={th}>Lab user</th><th style={th}>Email</th><th style={th}>Welcome email</th><th style={th}>First sign-in &amp; own password</th><th style={th}>Safety</th><th style={th} /></tr></thead>
                  <tbody>
                    {us.map(u => {
                      const ms = mailState(u)
                      const req = requiredSafetySteps(u.required_safety_steps)
                      const got = req.filter(n => done[u.id]?.has(n)).length
                      return (
                        <tr key={u.id}>
                          <td style={td2}>{fullName(u)}{!u.is_active && <span style={{ fontSize: 11, color: 'var(--text3)' }}> · inactive</span>}</td>
                          <td style={td2}>{u.email}</td>
                          <td style={{ ...td2, color: ms.tone === 'ok' ? '#085041' : ms.tone === 'bad' ? '#c84b2f' : 'var(--text2)' }}>{ms.label}</td>
                          <td style={{ ...td2, color: signedIn(u) ? '#085041' : 'var(--text3)' }}>
                            {u.password_set_at ? `✓ ${fmt(u.password_set_at)}` : signedIn(u) ? '✓ Signed in' : 'Not yet'}
                          </td>
                          <td style={td2}>
                            {req.length === 0 ? <span style={{ color: 'var(--text3)' }}>none required</span>
                              : got === req.length ? <span style={{ color: '#085041' }}>{got}/{req.length} done</span>
                              : `${got}/${req.length}`}
                          </td>
                          <td style={td2}>
                            {!signedIn(u) && u.is_active && (ms.resend || ms.tone === 'ok') && (
                              <button className="btn btn-sm" disabled={busy === u.id} onClick={() => resend(u)}>
                                {busy === u.id ? 'Sending…' : ms.label === 'Not sent' ? 'Send email' : 'Resend email'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {us.length === 0 && <tr><td colSpan={6} style={{ ...td2, color: 'var(--text3)' }}>Everyone from this import has since been deleted.</td></tr>}
                  </tbody>
                </table>
                <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 12px' }}>
                  Resend makes a new temporary password, so only the newest email works.
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
const td2 = { padding: '8px 6px', verticalAlign: 'middle' }
