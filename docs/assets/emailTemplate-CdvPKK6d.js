const s="https://ictlab.app/logo.svg",i="https://ictlab.app/";function c({title:a,body:o,ctaLabel:n="View in ICT-Lab →",ctaUrl:r=i,prefsUrl:l=i,orgContact:t=null,credentials:e=null}){const d=e?`
        <tr>
          <td style="padding:0 36px 20px;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;">
              <div style="margin-bottom:10px;">
                <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#9CA3AF;margin-bottom:4px;">Email</div>
                <div style="font-size:14px;font-weight:600;color:#111827;font-family:monospace;">`+x(e.email)+`</div>
              </div>
              <div>
                <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#9CA3AF;margin-bottom:4px;">Temporary Password</div>
                <div style="font-size:14px;font-weight:600;color:#111827;font-family:monospace;">`+x(e.password)+`</div>
              </div>
            </div>
            <p style="margin:8px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">These credentials expire in 72 hours if unused.</p>
          </td>
        </tr>`:"",p=t!=null&&t.contact_email?`
        <tr>
          <td style="padding:0 36px 24px;">
            <div style="background:#f0f9f6;border:1px solid #c6e6d8;border-radius:8px;padding:14px 16px;text-align:center;">
              <div style="font-size:12px;color:#6B7280;margin-bottom:5px;">Questions? Contact your lab administrator</div>
              `+(t.contact_name?'<div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:3px;">'+x(t.contact_name)+"</div>":"")+`
              <a href="mailto:`+x(t.contact_email)+'" style="font-size:13px;color:#1D9E75;text-decoration:none;font-weight:500;">'+x(t.contact_email)+`</a>
            </div>
          </td>
        </tr>`:"";return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>`+x(a)+`</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f4f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:#0d47a1;padding:28px 32px 24px;text-align:center;">
            <img src="`+s+`" width="72" height="72" alt="ICT-Lab logo" style="display:block;margin:0 auto 12px;border:0;">
            <div style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;line-height:1;">ICT-Lab</div>
            <div style="color:#ffb380;font-size:11px;font-weight:400;letter-spacing:1.2px;text-transform:uppercase;margin-top:5px;">The All-in-One Research Lab Platform</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 36px 24px;">
            <h2 style="margin:0 0 14px;font-size:17px;font-weight:700;color:#111827;line-height:1.4;">`+x(a)+`</h2>
            <p style="margin:0 0 28px;font-size:14px;color:#4B5563;line-height:1.7;">`+x(o)+`</p>
          </td>
        </tr>

        `+d+`

        <!-- CTA button -->
        <tr>
          <td style="padding:0 36px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
              <tr><td align="center">
                <a href="`+r+'" style="display:inline-block;background:#1D9E75;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:8px;letter-spacing:0.1px;">'+x(n)+`</a>
              </td></tr>
            </table>

            <!-- Notification prefs link (directly under the button) -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center">
                <a href="`+l+`" style="font-size:12px;color:#6B7280;text-decoration:underline;">Manage notification preferences</a>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- Org contact block -->
        `+p+`

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9CA3AF;line-height:1.6;">
              You received this notification because you are a member of a ICT-Lab organization.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`}function x(a){return String(a??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}export{c as b};
