import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import Modal from './Modal'

// Super admin: every change to the MAIN settings — organization settings and
// app-wide settings, the ones that change things for everyone — made by the
// super admin, org admins or lab managers. Rows are written by a DATABASE
// TRIGGER (change_log_setup.sql), so changes from the SQL editor or any screen
// are included, not only the ones the app makes on purpose. Lab users' own
// preferences are not recorded. The same changes raise a bell alert and go
// out in a daily email.

const TABLES = [
  ['', 'All settings'],
  ['organizations', 'Organization settings'],
  ['settings', 'App settings'],
]
const TABLE_LABEL = Object.fromEntries(TABLES)

const fmtTime = t => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// A value as it should read in the list: arrays of {key,label} (material types,
// icon pools) as their labels; anything else as compact JSON.
function show(v) {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? (x.label || x.key || JSON.stringify(x)) : String(x))).join(', ') || '(empty)'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function Entry({ e, idx }) {
  const [open, setOpen] = useState(false)
  const keys = e.fields?.length ? e.fields : Object.keys(e.new_values || e.old_values || {})
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 6, overflow: 'hidden', background: idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'baseline', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtTime(e.changed_at)}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
          <strong>{TABLE_LABEL[e.table_name] || e.table_name} {e.action}</strong>: {e.row_label || '—'}
          {e.action === 'changed' && keys.length > 0 && <span style={{ color: 'var(--text3)' }}> · {keys.join(', ')}</span>}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{e.changed_by}</span>
      </button>
      {open && (
        <div style={{ padding: '4px 12px 12px', display: 'grid', gap: 8 }}>
          {keys.map(k => (
            <div key={k} style={{ fontSize: 12, display: 'grid', gap: 2 }}>
              <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{k}</div>
              {e.old_values && <div style={{ color: '#c84b2f', overflowWrap: 'anywhere' }}><b>Before:</b> {show(e.old_values?.[k])}</div>}
              {e.new_values && <div style={{ color: '#085041', overflowWrap: 'anywhere' }}><b>After:</b> {show(e.new_values?.[k])}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChangeLogModal({ onClose }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [table, setTable] = useState('')
  const [q, setQ] = useState('')

  async function load(t = table) {
    setRows(null); setErr('')
    let query = sb.from('change_log').select('*').order('changed_at', { ascending: false }).limit(300)
    if (t) query = query.eq('table_name', t)
    const { data, error } = await query
    if (error) {
      setErr(/change_log/.test(error.message) || error.code === '42P01' || error.code === 'PGRST205'
        ? 'The change log is not set up in this database yet. Run change_log_setup.sql in the SQL Editor.'
        : 'Could not load the change log: ' + error.message)
      setRows([])
      return
    }
    setRows(data || [])
  }
  useEffect(() => { load('') }, [])

  const needle = q.trim().toLowerCase()
  const shown = (rows || []).filter(e => !needle || [e.row_label, e.changed_by, ...(e.fields || [])].some(v => (v || '').toLowerCase().includes(needle)))

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Change log</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>Newest first, last 300. Click an entry to see before and after.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={table} onChange={e => { setTable(e.target.value); load(e.target.value) }} style={{ width: 'auto' }}>
          {TABLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search organization, setting or person" style={{ flex: 1, minWidth: 180 }} />
      </div>
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {err ? <div style={{ color: '#c84b2f', fontSize: 13 }}>{err}</div>
          : rows === null ? <div className="spinner" style={{ margin: '16px auto' }} />
          : shown.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text3)', padding: 8 }}>{rows.length ? 'Nothing matches.' : 'No changes recorded yet.'}</div>
          : shown.map((e, i) => <Entry key={e.id} e={e} idx={i} />)}
      </div>
    </Modal>
  )
}

export default function ChangeLogCard() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 'var(--radius)', marginBottom: 16, border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>📜</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Change log</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Who changed a main setting — organization or app-wide — and when. Also in your bell and a daily email.</div>
          </div>
        </div>
        <button className="btn btn-sm" onClick={() => setOpen(true)}>Open change log</button>
      </div>
      {open && <ChangeLogModal onClose={() => setOpen(false)} />}
    </>
  )
}
