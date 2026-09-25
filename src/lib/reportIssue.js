import { sb } from './supabase'
import { buildEmailHtml } from './emailTemplate'

// One place that turns "something is broken" into a report an admin will
// actually see. Used by Sara; the Customer Service modal predates it and still
// has its own copy of the insert.
//
// A report fans out three ways on purpose, because each reaches someone
// differently and any one of them can be missed:
//   support_messages    the record and the queue an admin works through
//   admin_notifications the super admin bell, in-app
//   notifications       the org's own admins, in-app
//   email               so it is seen without the app being open
//
// Failures are collected, not thrown. A screenshot that will not upload must
// not lose the description the person just typed, and an email that will not
// queue must not discard the report itself.

const SUPPORT_EMAIL = 'ictengineers@mx.uillinois.edu'
const APP_URL       = 'https://ictlab.app'

export async function reportIssue({ session, message, file, screen }) {
  const problems = []
  const who   = session?.username || 'A user'
  const email = session?.email || null
  const role  = session?.role === 'admin' ? 'Org Admin'
              : session?.role === 'user'  ? 'Lab Manager'
              : session?.role === 'lab_user' ? 'Lab User' : 'User'

  // 1. screenshot — best effort, never blocks the report
  let attachment_url = null
  if (file) {
    try {
      const path = `support/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await sb.storage.from('project-files').upload(path, file, { contentType: file.type })
      if (error) throw error
      attachment_url = sb.storage.from('project-files').getPublicUrl(path).data.publicUrl
    } catch (e) {
      problems.push('the screenshot could not be uploaded')
      console.warn('[reportIssue] screenshot upload failed:', e?.message || e)
    }
  }

  const subject = `Problem report from ${who}${screen ? ` (${screen})` : ''}`
  const body = [
    `${role}: ${who}${email ? ` <${email}>` : ''}`,
    screen ? `Screen: ${screen}` : null,
    '',
    message,
    attachment_url ? `\nScreenshot: ${attachment_url}` : null,
  ].filter(v => v !== null).join('\n')

  // 2. the record. This one DOES block — with no row there is no report.
  const { error: insErr } = await sb.from('support_messages').insert({
    user_id: session?.userId || null,
    user_email: email,
    user_name: who,
    subject,
    message,
    attachment_url,
    status: 'open',
  })
  if (insErr) return { ok: false, error: insErr.message }

  // 3. super admin bell
  const { error: adminErr } = await sb.from('admin_notifications').insert({
    type: 'app_error', title: subject, body, read: false,
  })
  if (adminErr) problems.push('the super admin bell was not updated')

  // 4. the reporter's own org admins — they are who actually fixes things here
  if (session?.organizationId) {
    const { data: admins } = await sb.from('users').select('id')
      .eq('organization_id', session.organizationId)
      .in('role', ['admin', 'user']).eq('is_active', true)
    if (admins?.length) {
      const { error } = await sb.from('notifications').insert(admins.map(a => ({
        user_id: a.id, type: 'app_error', read: false,
        title: `Problem reported by ${who}`,
        body: message.slice(0, 200) + (message.length > 200 ? '…' : ''),
      })))
      if (error) problems.push('lab managers were not notified in-app')
    }
  }

  // 5. email, so it lands without the app being open
  const { error: mailErr } = await sb.from('email_notifications_queue').insert({
    to_email: SUPPORT_EMAIL,
    subject: `[ICT-Lab] ${subject}`,
    body,
    html_body: buildEmailHtml({
      title: subject, body,
      ctaLabel: 'Open ICT-Lab →', ctaUrl: `${APP_URL}/?screen=dashboard`,
      prefsUrl: `${APP_URL}/?screen=profile`,
    }),
  })
  if (mailErr) problems.push('the notification email was not queued')
  // Nudge the sender rather than waiting up to a minute for the cron.
  else fetch(`${sb.supabaseUrl}/functions/v1/send-emails`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      }).catch(() => {})

  return { ok: true, problems, attachment_url }
}
