import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { sb } from '../../lib/supabase'
import MaterialLabel from '../../components/MaterialLabel'
import Modal from '../../components/Modal'
import { printLabelById } from '../../lib/printLabel'
import {
  TESTED_LIMITS, TESTED_LOCATIONS, TESTED_OTHER_LIMITS, overLimit, testedLocation,
  generateTestedBarcodeId, buildTestedScanUrl, testedLabelSections,
  testedPillLines, linesToSections, sectionsToLines, testedWhat,
} from '../../lib/materialLabel'

// The "Tested" pill and the "Tested Materials" record list.
//
// A tested label here is not tied to one material: it can name one or more
// projects or non-project materials, or something the app does not hold at
// all ("Other"). Rows go in the same tested_materials table as labels made
// from a material's own "Tested materials label" tab, so the record list
// shows every tested label wherever it was made.
//
// The label is a list of lines (testedPillLines). It is MEASURED as drawn, not
// estimated from a count — a long name that wraps is two lines — and when it
// is taller than the 4x6 page the user unticks lines until it fits. The test
// name, date and location are locked: they are the reason the label exists.

const PAGE_PX = 576   // 6in at 96 CSS px per inch
const LINE_PX = 26    // one 20px bold value line at line-height 1.3
const ZERO = '00000000-0000-0000-0000-000000000000'
const today = () => new Date().toISOString().slice(0, 10)

// ── label preview: fit check, line removal, print ───────────────────────────
function TestedLabelPreview({ printId, lines, setLines, barcodeId, scanUrl, onPrint }) {
  const measureRef = useRef(null)
  const [over, setOver] = useState(0)
  const sections = linesToSections(lines)
  const sig = JSON.stringify(lines)

  useLayoutEffect(() => {
    const node = measureRef.current?.firstChild
    if (node) setOver(node.scrollHeight - PAGE_PX)
  }, [sig, barcodeId])

  const need = over > 0 ? Math.ceil(over / LINE_PX) : 0
  const anyOff = lines.some(l => l.off)
  const toggle = idx => setLines(ls => ls.map((l, i) => (i === idx && !l.lock ? { ...l, off: !l.off } : l)))

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* Measuring copy: natural height, never shown */}
      <div ref={measureRef} aria-hidden="true" style={{ position: 'absolute', left: -10000, top: 0, visibility: 'hidden', pointerEvents: 'none' }}>
        <MaterialLabel measure kind="Tested Material" sections={sections} scanUrl={scanUrl} barcodeId={barcodeId} />
      </div>

      <div style={{ flex: 1, minWidth: 260, maxWidth: 460, display: 'grid', gap: 10 }}>
        <div style={{ borderRadius: 10, padding: '10px 14px', fontSize: 13,
          background: need ? '#fdf0ed' : 'var(--accent-light)', border: `1px solid ${need ? '#f1c3b5' : '#9FE1CB'}` }}>
          {need ? (
            <>
              <strong style={{ color: '#c84b2f' }}>Too much for one label — remove {need} more line{need === 1 ? '' : 's'}.</strong>
              <div style={{ color: 'var(--text2)', marginTop: 2 }}>Untick lines below until it fits. A line that wraps counts as two. Test name, date and location always print.</div>
            </>
          ) : (
            <strong style={{ color: '#085041' }}>{anyOff ? 'It fits now. Ready to print.' : 'Everything fits. Ready to print.'}</strong>
          )}
        </div>

        {(need > 0 || anyOff) && (
          <div style={{ display: 'grid', gap: 4 }}>
            {lines.map((l, i) => (
              <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 0,
                background: l.lock ? 'var(--surface2)' : 'var(--surface)', cursor: l.lock ? 'default' : 'pointer', opacity: l.off ? 0.5 : 1, textDecoration: l.off ? 'line-through' : 'none' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={!l.off} disabled={!!l.lock} onChange={() => toggle(i)} />
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{l.v}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{l.lock ? 'always printed' : l.sec.replace(':', '')}</span>
              </label>
            ))}
          </div>
        )}

        <div>
          <button className="btn btn-sm btn-purple" disabled={need > 0} onClick={onPrint}>🖨 Print Label (4"×6")</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Barcode {barcodeId}</div>
      </div>

      <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
        <MaterialLabel id={printId} kind="Tested Material" sections={sections} scanUrl={scanUrl} barcodeId={barcodeId} />
      </div>
    </div>
  )
}

// The QR for a pill label: what was tested, its barcode and where it is.
function pillScanUrl(rec, singleProject) {
  return buildTestedScanUrl(rec, { name: testedWhat(rec) }, singleProject || {})
}

// ── multi-select: projects, then non-project materials, then Other ─────────
function ItemPicker({ projects, standalone, picked, setPicked }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef(null)
  useEffect(() => {
    const close = e => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const toggle = key => setPicked(p => (p.includes(key) ? p.filter(k => k !== key) : [...p, key]))
  const match = name => !q.trim() || (name || '').toLowerCase().includes(q.trim().toLowerCase())
  const label = key => key === 'other' ? 'Other'
    : key.startsWith('p:') ? projects.find(p => 'p:' + p.id === key)?.name
    : standalone.find(m => 'm:' + m.id === key)?.name

  const group = (title, rows) => rows.length > 0 && (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', padding: '10px 6px 4px' }}>{title}</div>
      {rows.map(r => (
        <label key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 6, borderRadius: 6, fontSize: 14, cursor: 'pointer', marginBottom: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={picked.includes(r.key)} onChange={() => toggle(r.key)} />
          <span style={{ flex: 1 }}>{r.name || '—'}</span>
          {r.sub && <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.sub}</span>}
        </label>
      ))}
    </>
  )

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width: '100%', minHeight: 40, textAlign: 'left', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '6px 36px 6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: 'var(--text)' }}>
        {picked.length === 0
          ? <span style={{ color: 'var(--text3)' }}>Select one or more projects or materials</span>
          : picked.map(k => <span key={k} style={{ fontSize: 12, fontWeight: 600, background: 'var(--accent3-light)', color: 'var(--accent3)', borderRadius: 99, padding: '2px 8px' }}>{label(k)}</span>)}
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 24px rgba(0,0,0,0.12)', padding: 8, maxHeight: 340, overflowY: 'auto' }}>
          <input type="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects and materials" style={{ marginBottom: 4 }} />
          {group('Projects', projects.filter(p => match(p.name)).map(p => ({ key: 'p:' + p.id, name: p.name, sub: p.project_id })))}
          {group('Non-project materials', standalone.filter(m => match(m.name)).map(m => ({ key: 'm:' + m.id, name: m.name })))}
          {group('Not listed', match('Other') ? [{ key: 'other', name: 'Other' }] : [])}
        </div>
      )}
    </div>
  )
}

// ── the Tested pill ─────────────────────────────────────────────────────────
export function TestedLabelForm({ session, isSolo }) {
  const { toast, viewingWorkspaceOwnerId } = useAppStore()
  const ownerId = viewingWorkspaceOwnerId || session?.userId || ZERO
  const orgId = session?.organizationId || ZERO
  const [projects, setProjects] = useState([])
  const [standalone, setStandalone] = useState([])
  const [picked, setPicked] = useState([])
  const [other, setOther] = useState({ name: '', project: '', info: '' })
  const [loc, setLoc] = useState('')
  const [locOther, setLocOther] = useState('')
  const [testName, setTestName] = useState('')
  const [testDate, setTestDate] = useState(today)
  const [includeInfo, setIncludeInfo] = useState(true)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [record, setRecord] = useState(null)
  const [lines, setLines] = useState([])
  const resultRef = useRef(null)

  useEffect(() => {
    let pq = sb.from('projects').select('id, name, project_id, pi_name, sampling_date').order('name')
    pq = isSolo ? pq.eq('solo_owner_id', ownerId) : pq.eq('organization_id', orgId)
    let mq = sb.from('project_materials').select('id, name, pi_name, sampling_date').is('project_id', null).order('name')
    mq = isSolo ? mq.eq('solo_owner_id', ownerId) : mq.eq('organization_id', orgId)
    Promise.all([pq, mq]).then(([p, m]) => {
      if (p.error || m.error) toast('Could not load projects and materials: ' + (p.error || m.error).message, true)
      setProjects(p.data || [])
      setStandalone(m.data || [])
    })
  }, [ownerId, orgId, isSolo])

  const items = useMemo(() => picked.filter(k => k !== 'other').map(k => {
    if (k.startsWith('p:')) { const p = projects.find(x => 'p:' + x.id === k); return p && { kind: 'project', ...p } }
    const m = standalone.find(x => 'm:' + x.id === k); return m && { kind: 'material', ...m }
  }).filter(Boolean), [picked, projects, standalone])
  const hasOther = picked.includes('other')
  const singleProject = items.length === 1 && items[0].kind === 'project' && !hasOther ? items[0] : null

  async function save() {
    setErr('')
    const name = testName.trim(), oName = other.name.trim()
    if (!picked.length) return setErr('Pick at least one project or material, or Other.')
    if (hasOther && !oName) return setErr('Give the Other material a name.')
    if (!loc) return setErr('Choose a storage location.')
    if (loc === 'Other' && !locOther.trim()) return setErr('Say where it is stored.')
    if (!name) return setErr('Test name is required.')
    if (!testDate) return setErr('Test date is required.')
    const tooLong = overLimit('Test name', name, TESTED_LIMITS.test_type)
      || (loc === 'Other' && overLimit('Other location', locOther.trim(), TESTED_LIMITS.storage_location_other))
      || (hasOther && (overLimit('Material name', oName, TESTED_OTHER_LIMITS.name)
        || overLimit('Project', other.project.trim(), TESTED_OTHER_LIMITS.project)
        || overLimit('Additional info', other.info.trim(), TESTED_OTHER_LIMITS.info)))
    if (tooLong) return setErr(tooLong)

    const id = crypto.randomUUID()
    const base = { storage_location: loc, storage_location_other: loc === 'Other' ? locOther.trim() : null }
    const built = testedPillLines({
      testName: name, testDate, location: testedLocation(base), items,
      other: hasOther ? { name: oName, project: other.project.trim(), info: other.info.trim() } : null,
      includeInfo: includeInfo && items.length > 0,
    })
    const row = {
      id,
      material_id: items.length === 1 && items[0].kind === 'material' && !hasOther ? items[0].id : null,
      project_id: singleProject?.id || null,
      organization_id: isSolo ? null : (session?.organizationId || null),
      solo_owner_id: isSolo ? ownerId : null,
      test_type: name,
      test_date: testDate,
      ...base,
      barcode_id: generateTestedBarcodeId(singleProject, { id }),
      created_by: session?.userId ? String(session.userId) : null,
      items: items.map(i => ({ kind: i.kind, id: i.id, name: i.name })),
      other_material_name: hasOther ? oName : null,
      other_project: hasOther ? (other.project.trim() || null) : null,
      additional_info: hasOther ? (other.info.trim() || null) : null,
      include_project_info: includeInfo && items.length > 0,
      label_lines: built,
    }
    setSaving(true)
    const { data, error } = await sb.from('tested_materials').insert(row).select().single()
    setSaving(false)
    if (error) return setErr('Could not save: ' + error.message)
    setRecord(data)
    setLines(built)
    toast('Saved to Tested Materials.')
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function print() {
    // Removing lines to fit is part of the label: store it, so Reprint matches
    const { error } = await sb.from('tested_materials').update({ label_lines: lines }).eq('id', record.id)
    if (error) toast('Printed, but the trimmed label was not saved: ' + error.message, true)
    printLabelById(`print-tested-${record.id}`, 'Tested Material Label')
  }

  function startNew() {
    setRecord(null); setLines([]); setPicked([]); setOther({ name: '', project: '', info: '' })
    setLoc(''); setLocOther(''); setTestName(''); setTestDate(today()); setIncludeInfo(true); setErr('')
  }

  const qn = n => <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginRight: 6 }}>{n}</span>
  const req = <span style={{ color: '#c84b2f' }}>*</span>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <fieldset disabled={!!record} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--surface)', padding: 16, margin: 0, display: 'grid', gap: 14, minWidth: 0 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>{qn(1)}What was tested? {req}</label>
          <ItemPicker projects={projects} standalone={standalone} picked={picked} setPicked={setPicked} />
        </div>

        {hasOther && (
          <div className="grid-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Material name {req}</label>
              <input maxLength={TESTED_OTHER_LIMITS.name} value={other.name} onChange={e => setOther(o => ({ ...o, name: e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Project (if applicable)</label>
              <input maxLength={TESTED_OTHER_LIMITS.project} value={other.project} onChange={e => setOther(o => ({ ...o, project: e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
              <label>Additional info</label>
              <input maxLength={TESTED_OTHER_LIMITS.info} value={other.info} onChange={e => setOther(o => ({ ...o, info: e.target.value }))} />
            </div>
          </div>
        )}

        <div className="grid-2">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{qn(2)}Storage location {req}</label>
            <select value={loc} onChange={e => setLoc(e.target.value)}>
              <option value="">— Select —</option>
              {TESTED_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {loc === 'Other' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Other location {req}</label>
              <input maxLength={TESTED_LIMITS.storage_location_other} value={locOther} onChange={e => setLocOther(e.target.value)} />
            </div>
          )}
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{qn(3)}Test name {req}</label>
            <input maxLength={TESTED_LIMITS.test_type} value={testName} placeholder="e.g. Hamburg wheel tracking" onChange={e => setTestName(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{qn(4)}Test date {req}</label>
            <input type="date" value={testDate} onChange={e => setTestDate(e.target.value)} />
          </div>
        </div>

        {items.length > 0 && (
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{qn(5)}Add the selected project info to the label?</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['yes', true], ['no', false]].map(([k, v]) => (
                <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 0, cursor: 'pointer', padding: '6px 14px', borderRadius: 99, fontSize: 13,
                  border: `1px solid ${includeInfo === v ? 'var(--accent)' : 'var(--border)'}`, background: includeInfo === v ? 'var(--accent-light)' : 'var(--surface)' }}>
                  <input type="radio" name="tested-info" style={{ width: 'auto' }} checked={includeInfo === v} onChange={() => setIncludeInfo(v)} />
                  {v ? 'Yes' : 'No'}
                </label>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              {items.length > 1 ? 'Several selected: adds the PI names only, each once.' : 'Adds the PI and the sampling date.'}
            </div>
          </div>
        )}

        {err && <div style={{ color: '#c84b2f', fontSize: 13 }}>{err}</div>}
        {!record && (
          <div>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save & print label'}</button>
          </div>
        )}
      </fieldset>

      {record && (
        <div ref={resultRef} style={{ display: 'grid', gap: 12, scrollMarginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text3)' }}>Saved to Tested Materials.</span>
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={startNew}>New tested label</button>
          </div>
          <TestedLabelPreview printId={`print-tested-${record.id}`} lines={lines} setLines={setLines}
            barcodeId={record.barcode_id} scanUrl={pillScanUrl(record, singleProject)} onPrint={print} />
        </div>
      )}
    </div>
  )
}

// ── Tested Materials: every tested label, from the pill and from material tabs
export function TestedMaterialsRecords({ session, isSolo }) {
  const { toast, viewingWorkspaceOwnerId } = useAppStore()
  const ownerId = viewingWorkspaceOwnerId || session?.userId || ZERO
  const orgId = session?.organizationId || ZERO
  const [rows, setRows] = useState([])
  const [matNames, setMatNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null)   // { rec, lines, scanUrl }

  useEffect(() => { load() }, [ownerId, orgId, isSolo])

  async function load() {
    let q = sb.from('tested_materials').select('*').order('created_at', { ascending: false })
    q = isSolo ? q.eq('solo_owner_id', ownerId) : q.eq('organization_id', orgId)
    const { data, error } = await q
    setLoading(false)
    if (error) { toast('Could not load tested materials: ' + error.message, true); return }
    setRows(data || [])
    // Labels made from a material's tab name only the material id
    const ids = [...new Set((data || []).filter(r => r.material_id && !r.items?.length).map(r => r.material_id))]
    if (ids.length) {
      const { data: mats } = await sb.from('project_materials').select('id, name').in('id', ids)
      setMatNames(Object.fromEntries((mats || []).map(m => [m.id, m.name])))
    }
  }

  const what = r => (r.items?.length || r.other_material_name) ? testedWhat(r) : (matNames[r.material_id] || '—')

  async function reprint(rec) {
    if (rec.label_lines?.length) {
      const project = rec.project_id ? (await sb.from('projects').select('id, name, project_id').eq('id', rec.project_id).maybeSingle()).data : null
      setOpen({ rec, lines: rec.label_lines, scanUrl: pillScanUrl(rec, project) })
      return
    }
    // From a material's own tab: rebuild its label exactly as that tab draws it
    const { data: m } = await sb.from('project_materials').select('*').eq('id', rec.material_id).maybeSingle()
    if (!m) { toast('The material this label was made from no longer exists.', true); return }
    const [{ data: project }, { data: parent }] = await Promise.all([
      m.project_id ? sb.from('projects').select('*').eq('id', m.project_id).maybeSingle() : Promise.resolve({ data: null }),
      m.parent_material_id ? sb.from('project_materials').select('*').eq('id', m.parent_material_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    setOpen({ rec, lines: sectionsToLines(testedLabelSections(rec, m, project || {}, parent)), scanUrl: buildTestedScanUrl(rec, m, project || {}) })
  }

  async function printOpen() {
    const { error } = await sb.from('tested_materials').update({ label_lines: open.lines }).eq('id', open.rec.id)
    if (error) toast('Printed, but the trimmed label was not saved: ' + error.message, true)
    else setRows(rs => rs.map(r => (r.id === open.rec.id ? { ...r, label_lines: open.lines } : r)))
    printLabelById(`print-tested-${open.rec.id}`, 'Tested Material Label')
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
        Every tested label — from the Tested pill and from a material's own Tested materials label tab. Reprint any of them as saved.
      </div>
      {rows.length === 0 ? (
        <div className="empty-state" style={{ padding: 40 }}>No tested labels yet. Make one from the <strong>Tested</strong> pill on Material Inventory.</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Test</th><th>Date</th><th>Tested</th><th>Location</th><th>Barcode</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.test_type}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.test_date || '—'}</td>
                  <td>{what(r)}</td>
                  <td>{testedLocation(r)}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.barcode_id}</td>
                  <td><button className="btn btn-sm" onClick={() => reprint(r)}>Reprint</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal onClose={() => setOpen(null)}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>{open.rec.test_type} — {what(open.rec)}</div>
          <TestedLabelPreview printId={`print-tested-${open.rec.id}`} lines={open.lines}
            setLines={fn => setOpen(o => ({ ...o, lines: typeof fn === 'function' ? fn(o.lines) : fn }))}
            barcodeId={open.rec.barcode_id} scanUrl={open.scanUrl} onPrint={printOpen} />
        </Modal>
      )}
    </div>
  )
}
