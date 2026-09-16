import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { ALL_MODULES_META, PINNED_MODULES, LAB_MANAGER_PINNED_MODULES } from './DashboardIconPicker'
import { orgPoolForRole } from '../lib/modulePools'
import { buildEmailHtml } from '../lib/emailTemplate'


// Tell the user what they were just given, and turn it on for them.
//
// A grant that only widens what they COULD pick is invisible: nothing changes
// on their home screen until they happen to open the icon picker. So newly
// granted modules are appended to active_modules as well — added, never
// removed, so this can't undo a choice they made.
const ICON_NOTIF_TYPE = 'icons_granted'

async function announceGrant(targetUser, addedKeys) {
  if (!addedKeys.length) return
  const names = addedKeys
    .map(k => ALL_MODULES_META.find(m => m.key === k)?.label || k)
    .join(', ')
  const title = addedKeys.length === 1 ? `New icon added: ${names}` : `${addedKeys.length} new icons added`
  const body  = `${names} ${addedKeys.length === 1 ? 'is' : 'are'} now on your home screen. `
              + 'You can add or remove icons any time from Profile → Dashboard Icons.'

  // Reading the recipient's prefs needs notification_prefs_select_org
  // (rls_phase1.sql) — without it the sender always sees null and no email
  // is ever queued.
  const { data: prefs } = await sb.from('notification_prefs')
    .select('*').eq('user_id', targetUser.id).maybeSingle()

  // In-app: on unless explicitly turned off.
  if (!prefs || prefs[ICON_NOTIF_TYPE] !== false) {
    const { error } = await sb.from('notifications')
      .insert({ user_id: targetUser.id, type: ICON_NOTIF_TYPE, title, body, read: false })
    if (error) console.warn('[LabUserIconManager] notification insert failed:', error.message)
  }

  // Email: opt-in only.
  if (prefs?.[`email_${ICON_NOTIF_TYPE}`] === true) {
    const { data: recipient } = await sb.from('users')
      .select('phone, email, organization_id').eq('id', targetUser.id).maybeSingle()
    const to = recipient?.phone || recipient?.email
    if (to) {
      let orgContact = null
      if (recipient?.organization_id) {
        const { data: org } = await sb.from('organizations')
          .select('contact_name, contact_email').eq('id', recipient.organization_id).maybeSingle()
        orgContact = org
      }
      const htmlBody = buildEmailHtml({
        title, body,
        ctaLabel: 'Open ICT-Lab →',
        ctaUrl: 'https://ictlab.app/?screen=profile',
        prefsUrl: 'https://ictlab.app/?screen=profile',
        orgContact,
      })
      const { error } = await sb.from('email_notifications_queue')
        .insert({ to_email: to, subject: title, body, html_body: htmlBody, user_id: targetUser.id, type: ICON_NOTIF_TYPE })
      if (error) console.warn('[LabUserIconManager] email queue insert failed:', error.message)
    }
  }
}

const ROLE_LABEL = { lab_user: 'Lab User', user: 'Lab Manager', admin: 'Org Admin' }


export default function LabUserIconManager({ labUser, orgId, onClose }) {
  const [poolModules, setPoolModules] = useState(null) // module meta available for this org
  const [allowed, setAllowed] = useState(null)         // currently assigned keys (Set)
  const [saving, setSaving] = useState(false)
  // What this role already had, captured at load, so save can tell which
  // modules are genuinely new rather than re-announcing every existing one.
  const prevAllowedRef = useRef(new Set())
  // One person can hold several users rows — Login links every row sharing an
  // email to the same account. Each row has its OWN icon pool, so editing the
  // lab user card silently left the same person's lab manager icons untouched
  // and there was nowhere to see them.
  const [roles, setRoles] = useState([labUser])
  const [activeRoleId, setActiveRoleId] = useState(labUser.id)
  const [saveError, setSaveError] = useState(null)
  const [existingRowIds, setExistingRowIds] = useState([]) // ALL rows found for this user_id — duplicates are a known issue

  const activeRole = roles.find(r => r.id === activeRoleId) || labUser
  // Lab managers keep their own pinned module on top of the shared ones.
  const pinnedFor = role => role === 'lab_user'
    ? PINNED_MODULES
    : [...new Set([...PINNED_MODULES, ...LAB_MANAGER_PINNED_MODULES])]
  const pinned = pinnedFor(activeRole.role)

  useEffect(() => { loadRoles() }, [labUser.id])
  useEffect(() => { load() }, [activeRoleId, roles.length])

  async function loadRoles() {
    setActiveRoleId(labUser.id)
    const email = (labUser.email || '').trim()
    if (!email || !orgId) { setRoles([labUser]); return }
    const { data, error } = await sb.from('users')
      .select('id, name, last_name, nick_name, email, role')
      .eq('organization_id', orgId)
      .ilike('email', email)
    if (error) { console.error('[LabUserIconManager] roles lookup failed:', error); setRoles([labUser]); return }
    // Only other roles that actually have a dashboard of their own.
    const others = (data || []).filter(u => u.id !== labUser.id && (u.role === 'user' || u.role === 'admin'))
    setRoles([labUser, ...others])
  }

  async function load() {
    // Load org's lab user pool (the boundary for what can be assigned)
    let pool = null
    if (orgId) {
      const { data } = await sb.from('organizations')
        .select('allowed_modules, allowed_modules_labusers, allowed_modules_labmanagers')
        .eq('id', orgId).maybeSingle()
      // orgPoolForRole picks the right column for the role — never compose
      // pools inline (src/lib/modulePools.js owns that rule).
      pool = orgPoolForRole(activeRole.role, data)
    }
    const mods = pool
      ? ALL_MODULES_META.filter(m => pool.includes(m.key) || pinned.includes(m.key))
      : ALL_MODULES_META.filter(m => activeRole.role === 'lab_user'
          ? (!m.neverLabUser && !m.adminOnly && !m.soloLocked)
          : (!m.adminOnly && !m.soloLocked))
    setPoolModules(mods)

    // Load ALL rows for this user_id — this table has no created_at column (a query
    // ordering by it errors out and silently returns no data — the root cause of this
    // whole bug) and can have duplicate rows for a user. Prefer whichever existing row
    // actually has allowed_modules populated rather than trusting row order.
    const { data: rows, error: loadErr } = await sb.from('user_dashboard_prefs')
      .select('id, allowed_modules')
      .eq('user_id', activeRole.id)
    if (loadErr) console.error('[LabUserIconManager] load failed:', loadErr)
    setExistingRowIds((rows || []).map(r => r.id))
    const bestRow = (rows || []).find(r => r.allowed_modules?.length) || rows?.[0] || null
    prevAllowedRef.current = new Set(bestRow?.allowed_modules || [])
    setAllowed(new Set(bestRow?.allowed_modules?.length ? bestRow.allowed_modules : []))
  }

  function toggle(key) {
    if (pinned.includes(key)) return
    setAllowed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Runs after the pool is written: turn the new modules on for the user and
  // tell them. Only for a lab user — a lab manager editing their own pool does
  // not need notifying about it.
  async function afterGrant(modules) {
    const added = modules.filter(k => !prevAllowedRef.current.has(k) && !pinned.includes(k))
    prevAllowedRef.current = new Set(modules)
    if (!added.length || activeRole.role !== 'lab_user') return

    // Append to what they already show, never replace: this must not undo a
    // module they deliberately hid.
    const { data: rows } = await sb.from('user_dashboard_prefs')
      .select('id, active_modules').eq('user_id', activeRole.id)
    const row = (rows || []).find(r => r.active_modules?.length) || rows?.[0] || null
    if (row) {
      const current = row.active_modules || []
      const next = [...current, ...added.filter(k => !current.includes(k))]
      if (next.length !== current.length) {
        const { error } = await sb.from('user_dashboard_prefs')
          .update({ active_modules: next }).eq('id', row.id)
        if (error) console.warn('[LabUserIconManager] could not auto-enable:', error.message)
      }
    }

    await announceGrant(activeRole, added)
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    const modules = [...pinned, ...Array.from(allowed).filter(k => !pinned.includes(k))]

    if (existingRowIds.length > 0) {
      // Update the specific row we already confirmed exists (by primary key, not by
      // user_id) so this can never silently create a duplicate row. If more than one
      // row exists for this user (a known issue with this table), write the same value
      // to all of them and delete the extras so reads relying on order-by-created_at
      // can't pick a stale/empty duplicate anymore.
      const [keepId, ...extraIds] = existingRowIds
      const { error: updateErr } = await sb.from('user_dashboard_prefs')
        .update({ allowed_modules: modules })
        .eq('id', keepId)
      if (updateErr) {
        console.error('[LabUserIconManager] update failed:', updateErr)
        setSaveError(`Failed to save: ${updateErr.message}`)
        setSaving(false)
        return
      }
      if (extraIds.length) {
        const { error: delErr } = await sb.from('user_dashboard_prefs').delete().in('id', extraIds)
        if (delErr) console.warn('[LabUserIconManager] could not clean up duplicate rows:', delErr.message)
      }
    } else {
      const { error: insertErr } = await sb.from('user_dashboard_prefs')
        .insert({ user_id: activeRole.id, organization_id: orgId || null, allowed_modules: modules })
      if (insertErr) {
        console.error('[LabUserIconManager] insert failed:', insertErr)
        setSaveError(`Failed to save: ${insertErr.message}`)
        setSaving(false)
        return
      }
    }
    await afterGrant(modules)
    setSaving(false)
    onClose(true)
  }

  const name = [labUser.email, labUser.name].filter(Boolean).join(' ')
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
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                Select which icons this {(ROLE_LABEL[activeRole.role] || 'user').toLowerCase()} is allowed to choose from on their dashboard.
                {roles.length > 1 && ' This person holds more than one role — each has its own set.'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>user_id: {activeRole.id}</div>
            </div>
            <button onClick={() => onClose(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', padding: '4px 8px' }}>✕</button>
          </div>
          {/* Only when this person actually holds more than one role. A single
              tab would just be chrome telling them something they know. */}
          {roles.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
              {roles.map(r => {
                const on = r.id === activeRoleId
                return (
                  <button key={r.id} type="button" onClick={() => setActiveRoleId(r.id)}
                    style={{ padding: '7px 16px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      background: on ? 'var(--accent)' : 'var(--surface)',
                      color: on ? '#fff' : 'var(--text2)' }}>
                    {ROLE_LABEL[r.role] || r.role}
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ background: '#e0f2fe', borderRadius: 8, padding: '8px 14px', marginTop: 14, fontSize: 12, color: '#0369a1', lineHeight: 1.5 }}>
            ℹ️ Icons shown are within your organization's {activeRole.role === 'lab_user' ? 'lab user' : activeRole.role === 'user' ? 'lab manager' : 'admin'} pool.
            They pick from <strong>only these icons</strong>. Profile is always visible.
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
                const isPinned = pinned.includes(m.key)
                const sel = isPinned || allowed.has(m.key)
                return (
                  <div key={m.key} onClick={() => toggle(m.key)}
                    style={{ borderRadius: 12, border: sel ? `2px solid ${m.color}` : '2px solid var(--border)', background: sel ? `${m.color}12` : 'var(--surface)', padding: '12px 12px 10px', cursor: isPinned ? 'default' : 'pointer', position: 'relative', transition: 'all 0.15s', opacity: isPinned ? 0.75 : 1, userSelect: 'none' }}>
                    <div style={{ position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: '50%', background: sel ? m.color : 'var(--surface2)', border: `2px solid ${sel ? m.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      {sel && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    <div style={{ fontSize: 24, marginBottom: 6, pointerEvents: 'none' }}>{m.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: sel ? m.color : 'var(--text)', marginBottom: 2, paddingRight: 20, pointerEvents: 'none' }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{m.sub}</div>
                    {isPinned && <div style={{ marginTop: 4, fontSize: 9, color: m.color, fontWeight: 700, pointerEvents: 'none' }}>Always visible</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {saveError && (
          <div style={{ margin: '0 24px', padding: '8px 12px', background: '#fef2f2', color: '#c84b2f', fontSize: 12, borderRadius: 8 }}>{saveError}</div>
        )}
        <div style={{ padding: '14px 24px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {ROLE_LABEL[activeRole.role] || 'User'} picks their visible icons from this assigned list.
          </div>
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
