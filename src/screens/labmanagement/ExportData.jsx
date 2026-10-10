import { useState, useEffect, useMemo } from 'react'
import { sb } from '../../lib/supabase'
import StorageService from '../../lib/storage/StorageService'

// Lab Management → Export Data. Lab managers and admins only.
//
// One ZIP. At the top, "Lab users/" and "Lab managers/"; inside, one folder
// per person holding EVERYTHING about them: their own workbook (one sheet per
// kind of data) and their uploaded files, sorted by where they came from.
//
// Read-only. Rows are fetched with select('*') and written out as stored, so
// a column added later appears in the export without anyone remembering to
// add it here — and a column that does not exist cannot fail the export.
// A table that does not exist in this database (each app has a few the other
// lacks) is skipped, not an error.

const APP_NAME = 'ICT-Lab'

const TRAINING = [
  { table: 'lab_safety_progress',     sheet: 'Safety steps',       folder: 'Safety' },
  { table: 'training_fresh',          sheet: 'Documents',          folder: 'Documents' },
  { table: 'training_golf_car',       sheet: 'Vehicle training',   folder: 'Vehicle' },
  { table: 'vehicle_agreements',      sheet: 'Vehicle agreements', folder: 'Vehicle' },
  { table: 'training_equipment',      sheet: 'Equipment training', folder: 'Equipment' },
  { table: 'equipment_exam_results',  sheet: 'Exam results',       folder: 'Exams' },
  { table: 'training_building_alarm', sheet: 'Building alarm',     folder: 'Alarm' },
  { table: 'lab_user_lockers',        sheet: 'Locker',             folder: 'Locker' },
  { table: 'retraining_requests',     sheet: 'Training requests',  folder: 'Requests' },
  { table: 'training_schedule',       sheet: 'Training schedule',  folder: 'Schedule' },
]
// Never exported: secrets, and ids that mean nothing outside the database
const DROP = new Set(['password_hash', 'pin', 'auth_id', 'organization_id', 'solo_owner_id', 'user_id'])
const ZERO = '00000000-0000-0000-0000-000000000000'
const today = () => new Date().toISOString().slice(0, 10)
const missingTable = e => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''))

const fullName = u => (u.nick_name?.trim() || [u.name, u.last_name].filter(Boolean).join(' ') || u.email || 'Unnamed').trim()
const safe = s => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'untitled'

// Any stored file reference in a row: columns ending in "url", whose value
// is a URL, an ext:provider:id ref, or a JSON object of those (Safety step 3
// keeps its three uploads that way).
function fileRefs(row) {
  const out = []
  const take = (v, label) => {
    if (typeof v !== 'string' || !v) return
    if (/^(https?:|ext:)/.test(v)) { out.push({ ref: v, label }); return }
    if (v.trim().startsWith('{')) {
      try { Object.entries(JSON.parse(v)).forEach(([k, x]) => take(x, `${label} ${k}`)) } catch { /* not JSON */ }
    }
  }
  Object.entries(row).forEach(([k, v]) => { if (/url$/i.test(k)) take(v, k.replace(/_?url$/i, '')) })
  return out
}

function fileNameFor(rec, f) {
  const fromRow = rec.file_name || rec.certificate_name || rec.doc_key || rec.step_number && `Step ${rec.step_number}`
  let base = ''
  try { base = decodeURIComponent(new URL(f.ref).pathname.split('/').pop() || '') } catch { base = f.ref.split(':').pop() }
  const ext = (base.match(/\.[a-z0-9]{2,5}$/i) || [''])[0]
  return safe([fromRow, f.label && f.label !== 'certificate' && f.label !== 'file' ? f.label : ''].filter(Boolean).join(' — ') || base.replace(ext, '')) + ext
}

function preview(groups, opts, range) {
  const L = []
  const sheets = ['Profile']
  if (opts.training) sheets.push('Safety steps', 'Documents', 'Vehicle…', 'Equipment training', 'Exam results', 'Building alarm', 'Locker', 'Training requests')
  if (opts.bookings) sheets.push(`Bookings (${range.from} → ${range.to})`)
  if (opts.projects) sheets.push('Projects', 'Materials', 'Tested materials')
  if (opts.files) sheets.push('Files', 'Files not included')
  groups.forEach(([title, people], gi) => {
    const lastG = gi === groups.length - 1
    L.push(`${lastG ? '└' : '├'}─ ${title}/  (${people.length})`)
    const pad = lastG ? '    ' : '│   '
    people.slice(0, 2).forEach((p, i) => {
      const last = i === Math.min(people.length, 2) - 1 && people.length <= 2
      L.push(`${pad}${last ? '└' : '├'}─ ${safe(fullName(p))}/`)
      const pad2 = pad + (last ? '    ' : '│   ')
      L.push(`${pad2}├─ ${safe(fullName(p))}.xlsx   ${sheets.length} sheets`)
      L.push(`${pad2}└─ ${opts.files ? 'Safety/  Documents/  Vehicle/ …' : '(no files)'}${opts.projects && opts.photos ? '  Projects/' : ''}`)
    })
    if (people.length > 2) L.push(`${pad}└─ …${people.length - 2} more`)
  })
  return L.join('\n')
}

export default function ExportData({ session, toast }) {
  const canExport = session?.role === 'admin' || session?.role === 'user'
  const orgId = session?.organizationId || ZERO
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [inactive, setInactive] = useState(false)
  const [mode, setMode] = useState('all')
  const [groups, setGroups] = useState({ lab_user: true, user: true })
  const [chosen, setChosen] = useState([])
  const [opts, setOpts] = useState({ training: true, files: true, bookings: true, projects: true, photos: false })
  const [range, setRange] = useState({ from: `${new Date().getFullYear()}-01-01`, to: today() })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    sb.from('users').select('id, name, last_name, nick_name, email, role, is_active')
      .eq('organization_id', orgId).in('role', ['lab_user', 'user']).order('name')
      .then(({ data, error }) => {
        if (error) toast?.('Could not load users: ' + error.message)
        setPeople(data || []); setLoading(false)
      })
  }, [orgId])

  const pool = people.filter(p => inactive || p.is_active)
  const labUsers = pool.filter(p => p.role === 'lab_user')
  const managers = pool.filter(p => p.role === 'user')
  const selected = useMemo(() => mode === 'all'
    ? pool.filter(p => groups[p.role])
    : pool.filter(p => chosen.includes(p.id)), [mode, pool, groups, chosen])
  const grouped = [['Lab users', selected.filter(p => p.role === 'lab_user')], ['Lab managers', selected.filter(p => p.role === 'user')]].filter(([, l]) => l.length)

  if (!canExport) return <div className="empty-state" style={{ padding: 40 }}>Only lab managers and admins can export data.</div>

  async function run() {
    if (!selected.length) { toast?.('Choose at least one person.'); return }
    if (!opts.training && !opts.bookings && !opts.projects) { toast?.('Choose at least one kind of data.'); return }
    setBusy(true); setResult(null)
    try {
      const [{ default: JSZip }, { default: ExcelJS }] = await Promise.all([import('jszip'), import('exceljs')])
      const ids = selected.map(p => p.id)
      const byUser = id => r => String(r.user_id) === String(id)

      setStatus('Reading records…')
      const { data: eqRows } = await sb.from('equipment_inventory').select('id, equipment_name, nickname').eq('organization_id', orgId)
      const eqName = Object.fromEntries((eqRows || []).map(e => [e.id, e.nickname || e.equipment_name]))
      const { data: profiles } = await sb.from('users').select('*').in('id', ids)

      const training = {}
      if (opts.training) {
        for (const t of TRAINING) {
          const { data, error } = await sb.from(t.table).select('*').in('user_id', ids)
          if (error) { if (!missingTable(error)) console.warn(`[export] ${t.table}:`, error.message); continue }
          training[t.table] = data || []
        }
      }
      let bookings = []
      if (opts.bookings) {
        const { data, error } = await sb.from('equipment_bookings').select('*').in('user_id', ids)
          .gte('start_time', `${range.from}T00:00:00`).lte('start_time', `${range.to}T23:59:59`).order('start_time')
        if (error) console.warn('[export] bookings:', error.message)
        bookings = data || []
      }

      const zip = new JSZip()
      const folderNames = new Set()
      let filesIn = 0, filesOut = 0
      for (let i = 0; i < selected.length; i++) {
        const p = selected[i]
        setStatus(`Preparing ${i + 1} of ${selected.length}: ${fullName(p)}…`)
        const group = p.role === 'lab_user' ? 'Lab users' : 'Lab managers'
        let name = safe(fullName(p))
        if (folderNames.has(group + '/' + name)) name = `${name} (${String(p.id).slice(0, 6)})`
        folderNames.add(group + '/' + name)
        const dir = zip.folder(group).folder(name)

        const wb = new ExcelJS.Workbook()
        const sheetNames = new Set()
        const addSheet = (title, rows) => {
          let t = title.slice(0, 31); let n = 2
          while (sheetNames.has(t)) t = `${title.slice(0, 28)} ${n++}`
          sheetNames.add(t)
          const ws = wb.addWorksheet(t)
          const clean = rows.map(r => {
            const o = {}
            Object.entries(r).forEach(([k, v]) => {
              if (DROP.has(k)) return
              o[k] = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : v
              if (k === 'equipment_id' && v) o.equipment = eqName[v] || ''
            })
            return o
          })
          const cols = [...new Set(clean.flatMap(o => Object.keys(o)))]
          if (!cols.length) { ws.addRow(['(none)']); return }
          ws.addRow(cols.map(c => c.replace(/_/g, ' ')))
          ws.getRow(1).font = { bold: true }
          clean.forEach(o => ws.addRow(cols.map(c => o[c])))
          ws.columns.forEach(c => { c.width = 18 })
        }

        const prof = (profiles || []).find(x => x.id === p.id) || p
        addSheet('Profile', [prof])

        const fileList = [], notIncluded = []
        async function addFiles(rows, folder) {
          for (const rec of rows) {
            for (const f of fileRefs(rec)) {
              const fname = fileNameFor(rec, f)
              try {
                const url = await StorageService.resolveUrl(f.ref)
                if (!url) throw new Error('stored in a personal Google Drive / OneDrive the app cannot read')
                const res = await fetch(url)
                if (!res.ok) throw new Error(`download failed (${res.status})`)
                let path = `${folder}/${fname}`, n = 2
                while (dir.file(path)) path = `${folder}/${fname.replace(/(\.[^.]+)?$/, ` (${n++})$1`)}`
                dir.file(path, await res.blob())
                fileList.push({ file: path, from: folder, stored_as: f.ref.startsWith('ext:') ? f.ref.split(':')[1] : 'app storage' })
                filesIn++
              } catch (e) {
                notIncluded.push({ file: fname, from: folder, reason: e.message || 'could not be downloaded', link: f.ref })
                filesOut++
              }
            }
          }
        }

        if (opts.training) {
          for (const t of TRAINING) {
            const rows = (training[t.table] || []).filter(byUser(p.id))
            if (!(t.table in training)) continue
            addSheet(t.sheet, rows)
            if (opts.files && rows.length) await addFiles(rows, t.folder)
          }
        }
        if (opts.bookings) addSheet(`Bookings ${range.from} to ${range.to}`.slice(0, 31), bookings.filter(byUser(p.id)))

        if (opts.projects) {
          const { data: projects } = await sb.from('projects').select('*')
            .or(`pi_user_id.eq.${p.id},lab_user_ids.cs.{${p.id}}`)
          const projectIds = (projects || []).map(x => x.id)
          let materials = [], tested = []
          if (projectIds.length) {
            materials = (await sb.from('project_materials').select('*').in('project_id', projectIds).order('created_at')).data || []
            const t1 = await sb.from('tested_materials').select('*').in('project_id', projectIds)
            if (!missingTable(t1.error)) tested = t1.data || []
          }
          // Folders as a path: "CM16 Coarse Aggregate › #4 › Sample A"
          const byId = Object.fromEntries(materials.map(m => [m.id, m]))
          const path = m => { const out = []; let x = m; const seen = new Set(); while (x && !seen.has(x.id)) { seen.add(x.id); out.unshift(x.name || x.id); x = byId[x.parent_material_id] } return out.join(' › ') }
          const projName = Object.fromEntries((projects || []).map(x => [x.id, x.name]))
          addSheet('Projects', projects || [])
          addSheet('Materials', materials.map(m => ({ project: projName[m.project_id] || '', folder: path(m), ...m })))
          addSheet('Tested materials', tested.map(t => ({ project: projName[t.project_id] || '', material: byId[t.material_id]?.name || '', ...t })))
          if (opts.photos) {
            for (const m of materials) {
              const photos = Array.isArray(m.photos) ? m.photos : []
              for (const [k, u] of photos.entries()) await addFiles([{ file_name: `${safe(path(m))} — photo ${k + 1}`, photo_url: u }], `Projects/${safe(projName[m.project_id])}`)
            }
          }
        }
        if (opts.files || (opts.projects && opts.photos)) {
          addSheet('Files', fileList)
          addSheet('Files not included', notIncluded)
        }
        dir.file(`${name}.xlsx`, await wb.xlsx.writeBuffer())
      }

      setStatus('Compressing…')
      const blob = await zip.generateAsync({ type: 'blob' })
      const scope = selected.length === 1 ? safe(fullName(selected[0])) : mode === 'all' ? 'all' : `${selected.length}-people`
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${APP_NAME}-export-${scope}-${today()}.zip`.replace(/\s+/g, '-')
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 30000)
      setResult({ people: selected.length, filesIn, filesOut })
      setStatus('')
    } catch (e) {
      console.error('[export] failed:', e)
      setStatus('')
      toast?.('Export failed: ' + (e.message || e))
    }
    setBusy(false)
  }

  const box = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', alignItems: 'start', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', marginBottom: 0 }
  const opt = (k, title, sub, extra) => (
    <label style={{ ...box, background: opts[k] ? '#f6fcf9' : 'var(--surface)', borderColor: opts[k] ? '#9FE1CB' : 'var(--border)' }}>
      <input type="checkbox" style={{ width: 'auto', marginTop: 3, gridRow: 'span 2' }} checked={opts[k]} onChange={e => setOpts(o => ({ ...o, [k]: e.target.checked }))} />
      <strong style={{ fontSize: 14 }}>{title}</strong>
      <span style={{ fontSize: 12, color: 'var(--text3)' }}>{sub}</span>
      {extra && <span style={{ gridColumn: 2, marginTop: 6, fontSize: 13, color: 'var(--text2)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }} onClick={e => e.preventDefault()}>{extra}</span>}
    </label>
  )
  const chip = p => (
    <button key={p.id} type="button" onClick={() => setChosen(c => c.includes(p.id) ? c.filter(x => x !== p.id) : [...c, p.id])}
      style={{ fontSize: 13, borderRadius: 99, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit',
        border: `1px solid ${chosen.includes(p.id) ? 'var(--accent)' : 'var(--border)'}`,
        background: chosen.includes(p.id) ? 'var(--accent)' : 'var(--surface)', color: chosen.includes(p.id) ? '#fff' : 'var(--text2)' }}>
      {fullName(p)}{!p.is_active ? ' (deactivated)' : ''}
    </button>
  )

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 340px)', gap: 16, alignItems: 'start' }} className="export-grid">
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'grid', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>1 · Whose data?</div>
          <div style={{ display: 'inline-flex', background: 'var(--surface2)', borderRadius: 10, padding: 2, gap: 2 }}>
            {[['all', 'Everyone'], ['some', 'Choose people']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMode(k)}
                style={{ fontSize: 13, fontWeight: 600, border: 0, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit',
                  background: mode === k ? 'var(--surface)' : 'transparent', color: mode === k ? '#085041' : 'var(--text2)', boxShadow: mode === k ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>{l}</button>
            ))}
          </div>
          {mode === 'all' ? (
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {[['lab_user', `Lab users (${labUsers.length})`], ['user', `Lab managers (${managers.length})`]].map(([k, l]) => (
                <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginBottom: 0, cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={groups[k]} onChange={e => setGroups(g => ({ ...g, [k]: e.target.checked }))} />{l}
                </label>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {labUsers.length > 0 && <div><div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)', marginBottom: 6 }}>Lab users</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{labUsers.map(chip)}</div></div>}
              {managers.length > 0 && <div><div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)', marginBottom: 6 }}>Lab managers</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{managers.map(chip)}</div></div>}
            </div>
          )}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text3)', marginTop: 10, marginBottom: 0, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={inactive} onChange={e => setInactive(e.target.checked)} />Include deactivated accounts
          </label>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>2 · What to include?</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {opt('training', 'Training records — every tab', 'Safety steps, Documents, Vehicle, Equipment training, exam results, Building alarm, Locker, training requests and schedule')}
            {opt('files', 'Uploaded files', 'Certificates, signed forms and other files in those records, filed in each person\'s folder')}
            {opt('bookings', 'Equipment bookings', 'Equipment, start and end time, status, who approved',
              <>From <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} style={{ width: 'auto', padding: '4px 6px' }} /> to <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} style={{ width: 'auto', padding: '4px 6px' }} /></>)}
            {opt('projects', 'Project materials', 'Projects each person is assigned to: project info, every material and its reductions as folder paths, label barcodes, tested-material labels',
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={opts.photos} onChange={e => setOpts(o => ({ ...o, photos: e.target.checked }))} /> include material photos (larger download)</label>)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={run} disabled={busy || !selected.length}>{busy ? 'Preparing…' : `⬇ Download export (${selected.length})`}</button>
          {status && <span style={{ fontSize: 13, color: 'var(--text2)' }}>{status}</span>}
        </div>
        {result && (
          <div style={{ fontSize: 13, background: 'var(--accent-light)', border: '1px solid #9FE1CB', borderRadius: 10, padding: '10px 12px', color: '#085041' }}>
            Downloaded: {result.people} {result.people === 1 ? 'person' : 'people'}, {result.filesIn} file{result.filesIn === 1 ? '' : 's'}.
            {result.filesOut > 0 && <> {result.filesOut} file{result.filesOut === 1 ? ' was' : 's were'} not included — see "Files not included" in that person's workbook.</>}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Built in your browser. With everyone and every option it can take a minute.</div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>What the download contains</div>
        <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.7, color: 'var(--text2)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, overflowX: 'auto' }}>
{`${APP_NAME}-export-${selected.length === 1 ? safe(fullName(selected[0])) : mode === 'all' ? 'all' : `${selected.length}-people`}-${today()}.zip\n` + (grouped.length ? preview(grouped, opts, range) : '└─ (nobody selected)')}
        </pre>
      </div>
    </div>
  )
}
