// ─────────────────────────────────────────────────────────────────
// FILL IN YOUR CREDENTIALS BEFORE USING CLOUD STORAGE OPTIONS
// ─────────────────────────────────────────────────────────────────

// Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID
// Enable: Google Drive API | Redirect URI: ilab://oauth-callback
export const GOOGLE_CLIENT_ID = '1064001328708-s4663d9m93b2q1vjd8rdp6ee3l9nvb01.apps.googleusercontent.com'
// NOTE: the Google client SECRET is intentionally NOT here. It must never ship
// in the browser bundle (Vite inlines VITE_* vars into public docs/ → leaked).
// Token exchange happens server-side in the `google-oauth` edge function.

// Azure Portal → App registrations → your app → Application (client) ID
// Permission: Microsoft Graph → Files.ReadWrite.AppFolder | Redirect URI: ilab://oauth-callback
export const ONEDRIVE_CLIENT_ID = 'eccf2095-28a2-4dcc-8bbd-cedf4abc668e'
