import { sb } from './supabase'
import { buildEmailHtml } from './emailTemplate'

// One notification sender for the task board.
//
// Lifted out of PM.jsx unchanged so the daily reminder check can use it too.
// A second copy would have been the third in this codebase, and the two that
// already exist have already drifted apart in what they send.
//
// The preference check is deliberately "not false", not "=== true": a user who
// has never opened the notifications panel has no prefs row at all, and they
// should still be notified.
export async function sendTaskNotification(userId, type, title, body, taskId = null) {
  if (!userId) return
  const { data: prefs } = await sb.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle()
  if (!prefs || prefs[type] !== false) {
    const { error } = await sb.from('notifications').insert({ user_id: userId, type, title, body, task_id: taskId, read: false })
    if (error) console.warn('[notify] in-app insert failed:', error.message)
  }
  if (prefs && prefs[`email_${type}`] === true) {
    const { data: user } = await sb.from('users').select('phone, email, organization_id').eq('id', userId).maybeSingle()
    const toEmail = user?.phone || user?.email
    if (!toEmail) return
    let orgContact = null
    if (user?.organization_id) {
      const { data: org } = await sb.from('organizations').select('contact_name, contact_email').eq('id', user.organization_id).maybeSingle()
      orgContact = org
    }
    const htmlBody = buildEmailHtml({
      title, body,
      ctaLabel: 'View Task in ICT-Lab →',
      ctaUrl: 'https://ictlab.app/?screen=pm',
      prefsUrl: 'https://ictlab.app/?screen=profile',
      orgContact,
    })
    const { error } = await sb.from('email_notifications_queue')
      .insert({ to_email: toEmail, subject: title, body, html_body: htmlBody, user_id: userId, type })
    if (error) console.warn('[notify] email queue failed:', error.message)
  }
}
