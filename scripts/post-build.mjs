import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs'

// Recreate docs/admin/index.html after every build.
// Vite wipes docs/ on each build, so GitHub Pages loses the /admin SPA route.
const src = readFileSync('docs/index.html', 'utf8')
const admin = src.replace('<title>ICT-Lab — Intelligent Lab Platform</title>', '<title>ICT-Lab — Admin</title>')
mkdirSync('docs/admin', { recursive: true })
writeFileSync('docs/admin/index.html', admin)
console.log('✓ docs/admin/index.html recreated')

// Recreate docs/oauth-callback.html — OAuth bridge page for Google Drive / OneDrive PKCE flow.
// Tries ilab:// deep link (native), falls back to main SPA URL (web) after 600ms.
writeFileSync('docs/oauth-callback.html', `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>iLab — connecting…</title></head>
<body>
<p style="font-family:sans-serif;color:#555;margin:40px auto;text-align:center;">Completing sign-in…</p>
<script>
  var search = window.location.search;
  if (search) {
    // Native Capacitor in-app browser: deep link fires appUrlOpen in the app
    window.location.href = 'ilab://oauth-callback' + search;
    // Web fallback: redirect to SPA (handles both success ?code= and error ?error=)
    setTimeout(function() {
      window.location.href = 'https://ictlab.app/' + search;
    }, 600);
  }
</script>
</body>
</html>`)
console.log('✓ docs/oauth-callback.html recreated')

// CNAME — set when a custom domain is configured; omit for now to use GitHub Pages default URL
// writeFileSync('docs/CNAME', 'ictlab.app')
// console.log('✓ docs/CNAME recreated')

// .nojekyll — prevents GitHub Pages from running Jekyll (which can strip/ignore files)
writeFileSync('docs/.nojekyll', '')
console.log('✓ docs/.nojekyll recreated')

// Privacy policy
mkdirSync('docs/privacy', { recursive: true })
writeFileSync('docs/privacy/index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — ICT-Lab</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.7; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin-top: 36px; }
    p, li { font-size: 15px; color: #333; }
    a { color: #1D9E75; }
    .updated { color: #888; font-size: 13px; margin-bottom: 32px; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <div class="updated">Last updated: June 2026</div>
  <p>ICT-Lab ("the platform", "we", "us") is an all-in-one research lab management platform available at <strong>ictlab.app</strong>. This policy explains what information we collect, how we use it, and your rights.</p>

  <h2>1. Information We Collect</h2>
  <ul>
    <li><strong>Account information:</strong> your name and email address, provided at sign-up (Solo accounts) or created by your lab administrator (Team accounts).</li>
    <li><strong>Profile data:</strong> optional avatar, photo, and display preferences you set in your profile.</li>
    <li><strong>Lab activity data:</strong> equipment bookings, inspection results, training certificates, project materials, maintenance records, and barcode/QR records you create within the platform.</li>
    <li><strong>Equipment photos:</strong> before/after condition photos uploaded as part of the booking process.</li>
    <li><strong>Files and documents:</strong> training certificates, project records, SOPs, floor plans, and other documents you upload, stored in your chosen storage provider.</li>
    <li><strong>Messages:</strong> messages sent between lab staff and users through the ICT-Lab messaging feature.</li>
    <li><strong>Support requests:</strong> subject, message, and contact email you provide when submitting a customer service request.</li>
    <li><strong>Usage and error data:</strong> anonymous technical error reports used to improve platform stability. These do not contain personal information.</li>
  </ul>

  <h2>2. How We Use Your Information</h2>
  <ul>
    <li>To operate all lab management features: equipment booking &amp; approval, inspections, training records, projects, preventive maintenance, and messaging</li>
    <li>To send booking confirmations, reminders, and status notifications</li>
    <li>To allow lab managers and administrators to review and manage lab activity within their organisation</li>
    <li>To respond to customer service and support requests</li>
    <li>To detect and fix technical errors in the platform</li>
    <li>To notify the platform administrator of new user registrations and system alerts</li>
  </ul>

  <h2>3. Solo Workspace Sharing</h2>
  <p>ICT-Lab Solo users may invite other users to view or collaborate on their personal workspace. When you accept an invitation, the workspace owner can see your name. You can leave a shared workspace at any time from your Profile settings.</p>

  <h2>4. Cloud Storage Integrations</h2>
  <p>ICT-Lab supports optional personal cloud storage providers for file uploads. When you connect a provider, the following applies:</p>
  <ul>
    <li><strong>Google Drive:</strong> ICT-Lab uses the Google Drive API to store and retrieve your files in a dedicated "ICT-Lab Files" folder. We request only the permissions needed to manage files in that folder and do not read, modify, or delete any other content. You can revoke access at any time from your <a href="https://myaccount.google.com/permissions" target="_blank">Google Account permissions page</a>.</li>
    <li><strong>Microsoft OneDrive:</strong> Files are stored in the app's designated AppFolder. We access only ICT-Lab-created files. You can revoke access from your Microsoft account settings.</li>
    <li><strong>WebDAV:</strong> Files are stored on the server you configure. ICT-Lab does not store your WebDAV credentials beyond your device's local storage.</li>
  </ul>
  <p>Organisational files (SOPs, equipment photos, module images, floor plans) are always stored in ICT-Lab's Supabase Storage regardless of your personal storage choice.</p>

  <h2>5. Data Storage</h2>
  <p>Platform data is stored in a Supabase database hosted in the United States. File uploads are stored either in Supabase Storage or in your chosen personal storage provider.</p>

  <h2>6. Data Sharing</h2>
  <p>We do not sell or share your personal data with third parties. Within the platform, data is accessible only to members of your organisation and authorised administrators. Support request content is accessible to the platform administrator for the purpose of responding to your request.</p>

  <h2>7. Data Retention &amp; Deletion</h2>
  <p>Your data is retained for as long as your account is active. To request deletion of your account and all associated data, contact your lab administrator or reach us at the address below.</p>

  <h2>8. Cookies &amp; Local Storage</h2>
  <p>ICT-Lab uses browser local storage to maintain your login session, storage provider preferences, and dashboard settings. No third-party tracking cookies are used.</p>

  <h2>9. Contact</h2>
  <p>For privacy questions or data requests: <a href="mailto:motlagh999@gmail.com">motlagh999@gmail.com</a></p>
  <p style="margin-top:48px;font-size:13px;color:#aaa;">© 2026 ICT-Lab. <a href="/" style="color:#aaa;">Back to app</a></p>
</body>
</html>`)
console.log('✓ docs/privacy/index.html recreated')

// Terms of service
mkdirSync('docs/terms', { recursive: true })
writeFileSync('docs/terms/index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Terms of Service — ICT-Lab</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.7; color: #1a1a2e; background: #f8f9fc; }
    header { background: #0C1140; color: #fff; padding: 32px 24px 28px; text-align: center; }
    header h1 { font-size: 2rem; font-weight: 700; margin-bottom: 6px; }
    header p { color: #FF9A4A; font-size: 0.92rem; }
    .container { max-width: 860px; margin: 40px auto; padding: 0 24px 60px; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.07); padding: 40px 48px; margin-bottom: 24px; }
    h2 { font-size: 1.15rem; font-weight: 700; color: #0C1140; border-left: 4px solid #FF6B1A; padding-left: 12px; margin: 32px 0 12px; }
    h2:first-child { margin-top: 0; }
    p { margin-bottom: 14px; color: #333; }
    ul { margin: 8px 0 14px 20px; color: #333; }
    li { margin-bottom: 6px; }
    a { color: #FF6B1A; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .highlight { background: #fff8f0; border-left: 4px solid #FF6B1A; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 16px 0; font-size: 0.95rem; }
    .warning { background: #fff3f3; border-left: 4px solid #c0392b; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 16px 0; font-size: 0.95rem; }
    .info-box { background: #f0f4ff; border-left: 4px solid #0C1140; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 16px 0; font-size: 0.95rem; }
    footer { text-align: center; color: #888; font-size: 0.85rem; padding: 24px; border-top: 1px solid #eee; margin-top: 40px; }
    strong { color: #0C1140; }
  </style>
</head>
<body>
<header>
  <h1>Terms of Service</h1>
  <p>ICT-Lab &mdash; Illinois Center for Transportation &mdash; Last updated: July 2026</p>
</header>
<div class="container">
<div class="card">

  <h2>Introduction</h2>
  <p>These Terms of Service ("Terms") govern your access to and use of ICT-Lab, the internal lab management platform operated by the <strong>Illinois Center for Transportation (ICT)</strong> at the University of Illinois Urbana-Champaign.</p>
  <p>ICT-Lab is a <strong>restricted, internal system</strong> intended solely for authorized ICT personnel, research engineers, and lab users. Access is granted by an ICT administrator and may be revoked at any time.</p>
  <p><strong>By logging in to ICT-Lab, you confirm that you have read, understood, and agree to be bound by these Terms.</strong> If you do not agree, you must not use the platform and should contact your administrator immediately.</p>

  <h2>1. Authorized Use Only</h2>
  <p>Access to ICT-Lab is restricted to individuals who have been granted an account by an ICT administrator. You must not:</p>
  <ul>
    <li>Attempt to access ICT-Lab without an authorized account</li>
    <li>Access or view data belonging to projects or areas outside your assigned responsibilities</li>
    <li>Use ICT-Lab for any purpose unrelated to your work at ICT</li>
    <li>Attempt to bypass, disable, or circumvent any security or access control features</li>
  </ul>

  <h2>2. Account Security &amp; Credential Responsibility</h2>
  <div class="warning">
    <strong>You are solely responsible for keeping your login credentials — username and password — confidential and secure.</strong>
  </div>
  <p>Specifically, you agree to:</p>
  <ul>
    <li><strong>Never share your username or password</strong> with any other person, including colleagues, students, or supervisors</li>
    <li>Use a strong, unique password and not reuse passwords from other systems</li>
    <li>Log out of ICT-Lab when using shared or public computers</li>
    <li>Report any suspected unauthorized access to your account immediately to <a href="mailto:ResearchengineersICT@illinois.edu">ResearchengineersICT@illinois.edu</a></li>
    <li>Not allow others to perform actions in the system using your credentials</li>
  </ul>
  <p>Any activity performed under your account is your responsibility. If your credentials are compromised, contact the research engineers immediately so your account can be secured.</p>

  <h2>3. Equipment Booking and Use</h2>
  <p>When booking equipment through ICT-Lab, you agree to:</p>
  <ul>
    <li>Book equipment only for authorized, work-related purposes</li>
    <li>Use equipment only during your approved booking period</li>
    <li>Inspect equipment at the start and end of each booking and document its condition accurately</li>
    <li>Report any damage, malfunction, or safety concern promptly — do not attempt to hide or downplay equipment issues</li>
    <li>Cancel bookings you no longer need in advance so others can use the equipment</li>
    <li>Follow all safety protocols and training requirements before operating any equipment</li>
  </ul>

  <h2>4. Accurate and Honest Record-Keeping</h2>
  <p>ICT-Lab is used to maintain official records including supply inspections, training certifications, maintenance logs, and booking history. You must:</p>
  <ul>
    <li>Record accurate, truthful information at all times</li>
    <li>Never falsify, alter, or omit information in any inspection, training, or maintenance record</li>
    <li>Not submit records on behalf of another user without explicit authorization from an administrator</li>
  </ul>
  <div class="warning">
    <strong>Falsification of records is a serious violation</strong> and may result in immediate account termination and referral to ICT management or the University's Office of Academic Integrity.
  </div>

  <h2>5. Training Compliance</h2>
  <p>Certain equipment and lab areas require completed training before use. You must:</p>
  <ul>
    <li>Complete all required training before accessing restricted equipment or areas</li>
    <li>Keep your training certifications current and renew them before expiration</li>
    <li>Only log training that you have genuinely completed</li>
    <li>Notify your supervisor and research engineers if your training lapses</li>
  </ul>

  <h2>6. Data Confidentiality</h2>
  <p>ICT-Lab contains research data, project files, supply records, and other information that may be sensitive or proprietary. You agree to:</p>
  <ul>
    <li>Keep all data you access through ICT-Lab confidential</li>
    <li>Not share, export, or reproduce data outside of authorized ICT workflows</li>
    <li>Not take screenshots or copies of other users' data without authorization</li>
    <li>Handle research project data in accordance with the applicable project's data management plan</li>
  </ul>

  <h2>7. ICT Policy Compliance</h2>
  <p>Your use of ICT-Lab must comply with all applicable ICT and University of Illinois policies. The full ICT Laboratory Policy is available here:</p>
  <div class="info-box">
    <strong>ICT Laboratory Policy:</strong> <a href="/ict-policy.pdf" target="_blank" rel="noopener noreferrer">Download ICT Policy PDF &rarr;</a><br/>
    <span style="font-size:0.9rem;color:#555;">You are expected to have read and understood this policy before using the lab or this platform.</span>
  </div>
  <p>In the event of any conflict between these Terms and the ICT Laboratory Policy, the ICT Laboratory Policy takes precedence.</p>

  <h2>8. Reporting Issues and Getting Help</h2>
  <p>For any issues related to equipment problems, account access, security concerns, lab procedures, or technical problems with ICT-Lab:</p>
  <div class="highlight">
    <strong>Contact the Research Engineers:</strong><br/>
    <a href="mailto:ResearchengineersICT@illinois.edu">ResearchengineersICT@illinois.edu</a>
  </div>

  <h2>9. Acceptable Use of the Platform</h2>
  <p>You agree <strong>not</strong> to:</p>
  <ul>
    <li>Upload or transmit any malicious files, viruses, or harmful code</li>
    <li>Attempt to access or modify data belonging to other users or projects outside your authorization</li>
    <li>Use automated scripts, bots, or tools to interact with ICT-Lab</li>
    <li>Attempt to reverse-engineer, decompile, or extract source code from the platform</li>
    <li>Use the platform for any personal, commercial, or non-ICT purpose</li>
    <li>Interfere with the platform's performance or availability for other users</li>
  </ul>

  <h2>10. Account Management and Termination</h2>
  <p>ICT-Lab accounts are administered by ICT administrators. An account may be suspended or permanently terminated for:</p>
  <ul>
    <li>Violation of any provision of these Terms</li>
    <li>Sharing credentials with another person</li>
    <li>Falsification of any record</li>
    <li>End of affiliation with ICT or the University of Illinois</li>
    <li>Extended inactivity or at the discretion of ICT management</li>
  </ul>

  <h2>11. No Expectation of Privacy on ICT Systems</h2>
  <p>ICT-Lab is operated on University of Illinois infrastructure. Activity on ICT-Lab may be logged and monitored by ICT administrators for security, compliance, and operational purposes.</p>

  <h2>12. Platform Availability</h2>
  <p>ICT-Lab is provided on a best-efforts basis. The platform may be temporarily unavailable for maintenance or updates. ICT is not responsible for any disruption to your work caused by platform downtime.</p>

  <h2>13. Changes to These Terms</h2>
  <p>When material changes are made, you will be prompted to review and accept the updated Terms before continuing to use the platform.</p>

  <h2>14. Governing Policy</h2>
  <p>These Terms are subject to the policies of the <strong>University of Illinois Urbana-Champaign</strong> and the <strong>Illinois Center for Transportation</strong>, and the laws of the State of Illinois.</p>

  <h2>15. Contact</h2>
  <p>For questions about these Terms or your account, contact the ICT Research Engineers at <a href="mailto:ResearchengineersICT@illinois.edu">ResearchengineersICT@illinois.edu</a>.</p>

</div>
</div>
<footer>
  &copy; 2026 Illinois Center for Transportation. All rights reserved. &nbsp;|&nbsp;
  <a href="/privacy/">Privacy Policy</a> &nbsp;|&nbsp;
  <a href="/">Back to ICT-Lab</a>
</footer>
</body>
</html>`)
console.log('✓ docs/terms/index.html recreated')
