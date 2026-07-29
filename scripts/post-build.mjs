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
      window.location.href = 'https://ictlab.labhive.app/' + search;
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
  <a href="/">Back to ICT-Lab</a>
</footer>
</body>
</html>`)
console.log('✓ docs/terms/index.html recreated')
