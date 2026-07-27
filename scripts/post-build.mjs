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
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.7; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin-top: 36px; }
    p, li { font-size: 15px; color: #333; }
    a { color: #1D9E75; }
    .updated { color: #888; font-size: 13px; margin-bottom: 32px; }
  </style>
</head>
<body>
  <h1>Terms of Service</h1>
  <div class="updated">Last updated: June 2026</div>
  <p>By using ICT-Lab ("the platform") at <strong>ictlab.app</strong>, you agree to these terms. Please read them carefully.</p>

  <h2>1. About ICT-Lab</h2>
  <p>ICT-Lab is an all-in-one research lab management platform providing equipment booking, room and supply inspections, training records, project management, preventive maintenance, barcode/QR management, team messaging, and related tools for research laboratories.</p>

  <h2>2. Account Types &amp; Access</h2>
  <p>ICT-Lab offers two account types:</p>
  <ul>
    <li><strong>ICT-Lab Team:</strong> Organisation-based accounts managed by a lab administrator. Access is granted by your organisation and is subject to your organisation's policies.</li>
    <li><strong>ICT-Lab Solo:</strong> Individual researcher accounts. You may create a free Solo account to manage your own lab resources independently.</li>
  </ul>
  <p>You are responsible for keeping your login credentials confidential. If you believe your account has been compromised, notify your lab administrator or contact us immediately. You may not share your account credentials with others.</p>

  <h2>3. Acceptable Use</h2>
  <p>You agree not to:</p>
  <ul>
    <li>Use the platform for any unlawful purpose</li>
    <li>Attempt to access accounts, data, or administrative functions you are not authorised to access</li>
    <li>Upload malicious files, scripts, or content of any kind</li>
    <li>Interfere with the operation of the platform or its infrastructure</li>
    <li>Use automated tools to scrape, overload, or abuse the platform</li>
    <li>Misrepresent your identity or organisational affiliation</li>
  </ul>

  <h2>4. Equipment Booking</h2>
  <p>Equipment bookings made through ICT-Lab are subject to approval by lab administrators. Approved bookings create a commitment to use the equipment at the scheduled time. You agree to complete any required before/after condition photos where requested and to report equipment issues promptly.</p>

  <h2>5. Content You Upload</h2>
  <p>You retain ownership of files, photos, and documents you upload. By uploading content, you grant ICT-Lab permission to store and display it as part of the platform's functionality. You are responsible for ensuring you have the right to upload any content you submit, and that it does not violate any laws or third-party rights.</p>

  <h2>6. Solo Workspace Sharing</h2>
  <p>Solo users may invite collaborators to their personal workspace. You are responsible for managing your invitations and the access you grant. ICT-Lab is not responsible for actions taken by invited collaborators within your workspace.</p>

  <h2>7. Cloud Storage Integrations</h2>
  <p>If you connect a third-party storage provider (Google Drive, OneDrive, or WebDAV), your use of that service is also governed by that provider's terms of service. ICT-Lab accesses only the files it creates in your designated folder and does not read or modify other content.</p>
  <ul>
    <li>Google Drive: subject to <a href="https://policies.google.com/terms" target="_blank">Google's Terms of Service</a></li>
    <li>Microsoft OneDrive: subject to <a href="https://www.microsoft.com/en-us/servicesagreement" target="_blank">Microsoft's Services Agreement</a></li>
  </ul>

  <h2>8. Customer Support</h2>
  <p>Support requests submitted through ICT-Lab are reviewed by the platform administrator. We aim to respond within a reasonable timeframe but do not guarantee response times.</p>

  <h2>9. Availability</h2>
  <p>We aim to keep ICT-Lab available at all times but do not guarantee uninterrupted access. We may update, modify, or perform maintenance on the platform at any time, with or without prior notice.</p>

  <h2>10. Limitation of Liability</h2>
  <p>ICT-Lab is provided "as is" without warranties of any kind. We are not liable for any loss of data, missed bookings, equipment damage, or other damages arising from use of the platform.</p>

  <h2>11. Changes to These Terms</h2>
  <p>We may update these terms from time to time. Continued use of the platform after changes are posted constitutes acceptance of the updated terms.</p>

  <h2>12. Contact</h2>
  <p>Questions about these terms: <a href="mailto:motlagh999@gmail.com">motlagh999@gmail.com</a></p>
  <p style="margin-top:48px;font-size:13px;color:#aaa;">© 2026 ICT-Lab. <a href="/" style="color:#aaa;">Back to app</a></p>
</body>
</html>`)
console.log('✓ docs/terms/index.html recreated')
