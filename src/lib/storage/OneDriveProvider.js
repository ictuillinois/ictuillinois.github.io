// OneDrive provider — PKCE OAuth, stores files in the app's special AppFolder
// AppFolder scope means the app CANNOT see any other OneDrive files.
// Requires an Azure app registration with Files.ReadWrite.AppFolder permission.
// Set your Client ID in src/lib/storage/config.js

import { ONEDRIVE_CLIENT_ID } from './config'

const REDIRECT_URI = 'https://ictlab.app/oauth-callback'
const SCOPE = 'Files.ReadWrite.AppFolder offline_access'
const TOKEN_KEY = 'ictlab_onedrive_token'
const VERIFIER_KEY = 'ictlab_onedrive_verifier'

function saveToken(t) { localStorage.setItem(TOKEN_KEY, JSON.stringify(t)) }
function loadToken() { try { return JSON.parse(localStorage.getItem(TOKEN_KEY)) } catch { return null } }

async function getValidToken() {
  let token = loadToken()
  if (!token) return null
  if (Date.now() < token.expires_at - 60_000) return token.access_token
  if (!token.refresh_token) { localStorage.removeItem(TOKEN_KEY); return null }
  const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: ONEDRIVE_CLIENT_ID, refresh_token: token.refresh_token, grant_type: 'refresh_token', scope: SCOPE }),
  })
  const data = await res.json()
  if (data.error) { localStorage.removeItem(TOKEN_KEY); return null }
  const updated = { ...token, access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 }
  saveToken(updated)
  return updated.access_token
}

async function graphReq(path, opts = {}) {
  const token = await getValidToken()
  if (!token) throw new Error('Not connected to OneDrive')
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  })
  if (!res.ok && res.status !== 204) throw new Error(`Graph API error: ${res.status}`)
  return res
}

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
function generateVerifier() {
  const buf = new Uint8Array(32); crypto.getRandomValues(buf); return base64url(buf)
}
async function generateChallenge(verifier) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(buf)
}

export class OneDriveProvider {
  isConnected() { return !!loadToken() }

  async connect() {
    const verifier = generateVerifier()
    const challenge = await generateChallenge(verifier)
    localStorage.setItem(VERIFIER_KEY, verifier)
    const params = new URLSearchParams({
      client_id: ONEDRIVE_CLIENT_ID, redirect_uri: REDIRECT_URI,
      response_type: 'code', scope: SCOPE,
      code_challenge: challenge, code_challenge_method: 'S256', state: 'onedrive',
    })
    const url = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${params}`
    window.location.href = url
  }

  async handleCallback(code) {
    const verifier = localStorage.getItem(VERIFIER_KEY)
    const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: ONEDRIVE_CLIENT_ID, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', code_verifier: verifier, scope: SCOPE }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error_description || 'OAuth failed')
    saveToken({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 })
    localStorage.removeItem(VERIFIER_KEY)
  }

  disconnect() { localStorage.removeItem(TOKEN_KEY) }

  async upload(_bucket, path, file) {
    const token = await getValidToken()
    const safePath = path.replace(/[^a-zA-Z0-9/_.-]/g, '_')
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${safePath}:/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) throw new Error('OneDrive upload failed')
    const { id } = await res.json()
    const ref = `ext:onedrive:${id}`
    return { url: ref, ref }
  }

  async resolveUrl(itemId) {
    try {
      const token = await getValidToken()
      if (!token) return null
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    } catch { return null }
  }

  async remove(_bucket, ref) {
    try {
      const itemId = ref.replace('ext:onedrive:', '')
      await graphReq(`/me/drive/items/${itemId}`, { method: 'DELETE' })
    } catch {}
  }
}
