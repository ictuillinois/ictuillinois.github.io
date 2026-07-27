import { buildEmailHtml } from './emailTemplate.js'

export async function queueWelcomeEmail(sb, { name, toEmail, orgId, userId = null, password = null }) {
  if (!toEmail) return
  let orgContact = null
  let orgName = 'your organization'
  if (orgId) {
    const { data: org } = await sb.from('organizations').select('name, contact_name, contact_email').eq('id', orgId).maybeSingle()
    if (org) { orgName = org.name || orgName; orgContact = org }
  }
  const subject = 'Your ICT-Lab account is ready'
  const title = `Welcome to ICT-Lab, ${name}!`
  const body = `Your account has been created for ${orgName}. Use the credentials below to sign in. You will be prompted to set a new password on your first login.`
  const htmlBody = buildEmailHtml({
    title,
    body,
    ctaLabel: 'Sign in to ICT-Lab →',
    ctaUrl: 'https://ictlab.app/',
    prefsUrl: 'https://ictlab.app/?screen=profile',
    orgContact,
    credentials: password ? { email: toEmail, password } : null,
  })
  const { error } = await sb.from('email_notifications_queue').insert({ to_email: toEmail, subject, body, html_body: htmlBody, user_id: userId, type: 'welcome' })
  if (error) console.warn('Welcome email queue failed:', error.message)
}
