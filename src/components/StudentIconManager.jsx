import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { ALL_MODULES_META, PINNED_MODULES } from './DashboardIconPicker'

export default function StudentIconManager({ student, orgId, onClose }) {
  const [poolModules, setPoolModules] = useState(null) // module meta available for this org
  const [allowed, setAllowed] = useState(null)         // currently assigned keys (Set)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [student.id])

  async function load() {
    // Load org's lab user pool (the boundary for what can be assigned)
    let pool = null
    if (orgId) {
      const { data } = await sb.from('organizations')
        .select('allowed_modules, allowed_modules_labusers')
        .eq('id', orgId).maybeSingle()
      pool = data?.allowed_modules_labusers ?? data?.allowed_modules
    }
    const mods = pool
      ? ALL_MODULES_META.filter(m => pool.includes(m.key) || m.key === 'profile')
      : ALL_MODULES_META.filter(m => !m.staffOnly && !m.adminOnly && !m.soloLocked)
    setPoolModules(mods)

    // Load student's currently assigned allowed_modules
    const { data: rows } = await sb.from('user_dashboard_prefs')
      .select('allowed_modules')
      .eq('user_id', student.id)
      .order('created_at', { ascending: false })
      .limit(1)
    const row = rows?.[0] ?? null
    setAllowed(new Set(row?.allowed_modules?.length ? row.allowed_modules : []))
  }

  function toggle(key) {
    if (PINNED_MODULES.includes(key)) return
    setAllowed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function save() {
    setSaving(true)
    const modules = [...PINNED_MODULES, ...Array.from(allowed).filter(k => !PINNED_MODULES.includes(k))]
    const { data: updated } = await sb.from('user_dashboard_prefs')
      .update({ allowed_modules: modules })
      .eq('user_id', student.id)
      .select('id')
    if (!updated?.length) {
      await sb.from('user_dashboard_prefs').insert({ user_id: student.id, allowed_modules: modules })
    }
    setSaving(false)
    onClose(true)
  }

  const name = [student.email, student.name].filter(Boolean).join(' ')
  const selectedCount = allowed?.size ?? 0
  const totalCount = poolModules?.length ?? 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(false) }}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 620, maxHeight: '88vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>

        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🎛️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>Dashboard icons for {name}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Select which icons this lab user is allowed to choose from on their dashboard.</div>
            </div>
            <button onClick={() => onClose(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', padding: '4px 8px' }}>✕</button>
          </div>
          <div style={{ background: '#e0f2fe', borderRadius: 8, padding: '8px 14px', marginTop: 14, fontSize: 12, color: '#0369a1', lineHeight: 1.5 }}>
            ℹ️ Icons shown are within your organization's lab user pool. The student picks from <strong>only these icons</strong>. Profile is always visible.
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0 14px' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}><span style={{ fontWeight: 600, color: 'var(--text)' }}>{selectedCount}</span> of {totalCount} assigned</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => poolModules && setAllowed(new Set(poolModules.map(m => m.key)))} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}>Assign all</button>
              <span style={{ color: 'var(--border)' }}>·</span>
              <button onClick={() => setAllowed(new Set())} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontWeight: 500 }}>Clear</button>
            </div>
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 24px', flex: 1 }}>
          {poolModules === null || allowed === null ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 10, paddingBottom: 20 }}>
              {poolModules.map(m => {
                const pinned = PINNED_MODULES.includes(m.key)
                const sel = pinned || allowed.has(m.key)
                return (
                  <div key={m.key} onClick={() => toggle(m.key)}
                    style={{ borderRadius: 12, border: sel ? `2px solid ${m.color}` : '2px solid var(--border)', background: sel ? `${m.color}12` : 'var(--surface)', padding: '12px 12px 10px', cursor: pinned ? 'default' : 'pointer', position: 'relative', transition: 'all 0.15s', opacity: pinned ? 0.75 : 1, userSelect: 'none' }}>
                    <div style={{ position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: '50%', background: sel ? m.color : 'var(--surface2)', border: `2px solid ${sel ? m.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      {sel && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    <div style={{ fontSize: 24, marginBottom: 6, pointerEvents: 'none' }}>{m.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: sel ? m.color : 'var(--text)', marginBottom: 2, paddingRight: 20, pointerEvents: 'none' }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{m.sub}</div>
                    {pinned && <div style={{ marginTop: 4, fontSize: 9, color: m.color, fontWeight: 700, pointerEvents: 'none' }}>Always visible</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Student picks their visible icons from this assigned list.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={() => onClose(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save assigned icons'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
