import { buildEmailHtml } from './emailTemplate.js'

// The first email a new lab user receives: their temporary password and what
// to do with it.
//
// The instructions are written out in full rather than left to "sign in and
// follow the prompts", because this account is not usable until three safety
// steps are finished and approved. Someone who signs in expecting a working
// site and meets a locked home page assumes it is broken.

const LAB_URL  = 'https://ictlab.labhive.app'
const MAIN_URL = 'https://ict.illinois.edu'

const STEPS = [
  `<strong>ICT Lab Access Website.</strong> To access the ICT labs we use a separate
   website: <a href="${LAB_URL}" style="color:#1D9E75;font-weight:600;">${LAB_URL}</a>.
   Please note this is different from the main ICT website,
   <a href="${MAIN_URL}" style="color:#1D9E75;">${MAIN_URL}</a>.`,

  `When you open the ICT Lab Access website, you will be asked to enter your
   temporary password — it is included in this email. Use it to log in, then
   change it to your own password.`,

  `Once you log in, you will be asked to complete the required safety training
   before you can reach the homepage and use the website features.`,

  `Under the <strong>Safety</strong> tab, please start with Step 1, followed by
   Step 2, and then Step 3.`,

  `Once you have uploaded the required certifications and passed the knowledge
   tests, a lab manager will review and approve your access. After approval you
   may begin using the website and accessing the available lab features.`,

  `Please let us know if you have any questions or need assistance during the
   process.`,
]

export async function queueWelcomeEmail(sb, { name, toEmail, orgId, userId = null, password = null }) {
  if (!toEmail) return
  let orgContact = null
  if (orgId) {
    const { data: org } = await sb.from('organizations').select('name, contact_name, contact_email').eq('id', orgId).maybeSingle()
    if (org) orgContact = org
  }

  const subject = 'Your ICT-Lab account is ready'
  const title   = `Welcome to ICT, ${name}!`

  // Plain text, for clients that do not render HTML. Not a summary of the HTML
  // — the same instructions, so nobody gets a shorter version by accident.
  const body =
`Hi,

Please follow the steps below to complete your ICT website registration and safety training. Once you complete these steps, we will schedule a short safety tour for you, and you will be able to start exploring the website features.

Thank you, and welcome to ICT!

1. ICT Lab Access Website. To access the ICT labs we use a separate website: ${LAB_URL}. Please note this is different from the main ICT website, ${MAIN_URL}.
2. When you open the ICT Lab Access website, you will be asked to enter your temporary password — it is included in this email. Use it to log in, then change it to your own password.
3. Once you log in, you will be asked to complete the required safety training before you can reach the homepage and use the website features.
4. Under the Safety tab, please start with Step 1, followed by Step 2, and then Step 3.
5. Once you have uploaded the required certifications and passed the knowledge tests, a lab manager will review and approve your access. After approval you may begin using the website and accessing the available lab features.
6. Please let us know if you have any questions or need assistance during the process.

Again, welcome to ICT! We look forward to working with you.`

  const para = 'margin:0 0 16px;font-size:14px;color:#4B5563;line-height:1.7;'
  const bodyHtml = `
            <p style="${para}">Hi,</p>
            <p style="${para}">Please follow the steps below to complete your ICT website registration
              and safety training. Once you complete these steps, we will schedule a short safety tour
              for you, and you will be able to start exploring the website features.</p>
            <p style="${para}">Thank you, and welcome to ICT!</p>
            <ol style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#4B5563;line-height:1.7;">
              ${STEPS.map(t => `<li style="margin-bottom:10px;">${t}</li>`).join('\n              ')}
            </ol>
            <p style="margin:0 0 28px;font-size:14px;color:#4B5563;line-height:1.7;">
              Again, welcome to ICT! We look forward to working with you.</p>`

  const htmlBody = buildEmailHtml({
    title,
    body,
    bodyHtml,
    ctaLabel: 'Open ICT Lab Access →',
    // ictlab.app is not a registered domain — the old link here led nowhere.
    ctaUrl: LAB_URL,
    prefsUrl: `${LAB_URL}/?screen=profile`,
    orgContact,
    credentials: password ? { email: toEmail, password } : null,
  })

  const { error } = await sb.from('email_notifications_queue').insert({
    to_email: toEmail, subject, body, html_body: htmlBody, user_id: userId, type: 'welcome',
  })
  if (error) console.warn('Welcome email queue failed:', error.message)
}
