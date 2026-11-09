// The tests on one instrument as a row of pills (Nov 2026) — Equipment SOP's
// SOP card and the Exam tab use the same row, so a test added in one place
// shows in the other. Lab managers / admins add, rename and remove tests here.
// Rules live in lib/equipmentTests.js.
import { useState } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'
import { GENERAL, entryKey, testLabel } from '../lib/equipmentTests'
import { IconPlus } from './Icons'

const STANDARD_MAX = 30
const NAME_MAX = 60

export default function TestPills({ equipmentId, entries, selected, onSelect, canManage = false, onChanged, badge, label = 'Tests on this equipment' }) {
  const { toast } = useAppStore()
  const [form, setForm] = useState(null)   // { id?, standard, name }
  const [saving, setSaving] = useState(false)
  const tests = entries.filter(e => e !== GENERAL)
  const current = tests.find(t => t.id === selected)

  // A lab user sees the row only when there is a choice to make.
  if (!canManage && entries.length < 2) return null

  async function save() {
    const standard = form.standard.trim(), name = form.name.trim()
    if (!name) { toast('Give the test a name, e.g. DSR.'); return }
    setSaving(true)
    const row = { standard: standard || null, name }
    const { data, error } = form.id
      ? await sb.from('equipment_tests').update(row).eq('id', form.id).select('id')
      : await sb.from('equipment_tests').insert({ ...row, equipment_id: equipmentId, order_num: tests.length }).select('id')
    setSaving(false)
    if (error || !data?.length) {
      toast(error && /equipment_tests|schema cache/i.test(error.message)
        ? 'Tests need equipment_tests_setup.sql to be run in Supabase first.'
        : 'Could not save the test' + (error ? ': ' + error.message : ' — nothing was changed.'))
      return
    }
    toast(form.id ? 'Test renamed ✓' : 'Test added ✓')
    setForm(null)
    onChanged?.(data[0].id)
  }

  async function remove() {
    if (!confirm(`Remove ${testLabel(current)}? Its SOP and exam questions are removed with it. Exam results already taken are kept.`)) return
    const { data, error } = await sb.from('equipment_tests').delete().eq('id', current.id).select('id')
    if (error || !data?.length) { toast('Could not remove the test' + (error ? ': ' + error.message : '.')); return }
    toast('Test removed.')
    setForm(null)
    onChanged?.(null)
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {entries.map(e => {
          const k = entryKey(e), on = k === selected
          const b = badge?.(k)
          return (
            <button key={k} className={'filter-btn test-pill' + (on ? ' active' : '')} onClick={() => { onSelect(k); setForm(null) }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {testLabel(e)}
              {b && <span style={{ fontSize: 11, padding: '0 6px', borderRadius: 99, fontWeight: 600,
                background: on ? 'rgba(255,255,255,.25)' : b.bg, color: on ? '#fff' : b.fg }}>{b.text}</span>}
            </button>
          )
        })}
        {canManage && (
          <button className={'filter-btn test-pill' + (form && !form.id ? ' active' : '')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => setForm(form && !form.id ? null : { standard: '', name: '' })}>
            <IconPlus size={14} /> Add test
          </button>
        )}
        {canManage && current && !form && (
          <button className="btn btn-sm" style={{ fontSize: 12, padding: '2px 10px' }}
            onClick={() => setForm({ id: current.id, standard: current.standard || '', name: current.name || '' })}>Rename / remove</button>
        )}
      </div>
      {form && (
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 160px', marginBottom: 8 }}>
              <label>Standard <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span></label>
              <input value={form.standard} maxLength={STANDARD_MAX} onChange={e => setForm(f => ({ ...f, standard: e.target.value }))} placeholder="AASHTO T 315" />
            </div>
            <div className="field" style={{ flex: '2 1 200px', marginBottom: 8 }}>
              <label>Test name <span style={{ color: '#c84b2f' }}>*</span></label>
              <input value={form.name} maxLength={NAME_MAX} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="DSR" autoFocus
                onKeyDown={e => e.key === 'Enter' && save()} />
            </div>
          </div>
          {!form.id && entries.includes(GENERAL) && tests.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
              This equipment's current SOP and exam stay under <b>General</b>. Each new test gets its own SOP and exam.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : form.id ? 'Save' : 'Add test'}</button>
            <button className="btn btn-sm" onClick={() => setForm(null)}>Cancel</button>
            {form.id && <button className="btn btn-sm btn-danger" style={{ marginLeft: 'auto' }} onClick={remove}>Remove test</button>}
          </div>
        </div>
      )}
    </div>
  )
}
