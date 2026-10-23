import { sb } from './supabase'
import { buildEmailHtml } from './emailTemplate'

// Vehicle requests and forms (ICT-Lab, Oct 2026). Before this, a lab user
// asking for a vehicle or uploading a signed form told nobody — the request
// waited until a lab manager happened to open the Vehicle tab.
//
// In-app unless the recipient turned the preference off; email only when they
// turned it on — the same rule as every other notification here. Lab managers
// use the "training submitted" preference, lab users "training approved".
// The bell opens Training Records → Vehicle for every vehicle_* type.

const APP_URL = 'https://ictlab.labhive.app'

async function sendOne(userId, { type, prefKey, title, body }) {
  const { data: prefs } = await sb.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle()
  if (!prefs || prefs[prefKey] !== false) {
    const { error } = await sb.from('notifications').insert({ user_id: userId, type, title, body, read: false })
    if (error) console.warn('[vehicle notify] in-app failed:', error.message)
  }
  if (prefs?.[`email_${prefKey}`] === true) {
    const { data: u } = await sb.from('users').select('email, phone').eq('id', userId).maybeSingle()
    const toEmail = u?.phone || u?.email
    if (!toEmail) return
    const html = buildEmailHtml({ title, body, ctaLabel: 'Open the Vehicle tab →', ctaUrl: `${APP_URL}/?screen=training`, prefsUrl: `${APP_URL}/?screen=profile` })
    const { error } = await sb.from('email_notifications_queue').insert({ to_email: toEmail, subject: title, body, html_body: html, user_id: userId, type })
    if (error) console.warn('[vehicle notify] email failed:', error.message)
  }
}

// Every active org admin and lab manager of the organization
export async function notifyVehicleManagers(orgId, { type, title, body }) {
  if (!orgId) return
  try {
    const { data: managers } = await sb.from('users').select('id')
      .eq('organization_id', orgId).in('role', ['admin', 'user']).eq('is_active', true)
    for (const m of managers || []) await sendOne(m.id, { type, prefKey: 'training_submitted', title, body })
  } catch (e) { console.warn('[vehicle notify] managers failed:', e) }
}

export async function notifyVehicleUser(userId, { type, title, body }) {
  if (!userId) return
  try { await sendOne(userId, { type, prefKey: 'training_approved', title, body }) }
  catch (e) { console.warn('[vehicle notify] user failed:', e) }
}
