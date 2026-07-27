// WebDAV provider — connects to user's personal computer or NAS
// Config stored in localStorage: ictlab_webdav_config = { url, username, password }

const CONFIG_KEY = 'ictlab_webdav_config'

export function getWebDAVConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) } catch { return null }
}
export function saveWebDAVConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}
export function clearWebDAVConfig() {
  localStorage.removeItem(CONFIG_KEY)
}

function authHeader(config) {
  return 'Basic ' + btoa(`${config.username}:${config.password}`)
}

function serverUrl(config, path) {
  const base = config.url.replace(/\/$/, '')
  return `${base}/iLab/${path}`
}

async function ensureFolder(config, folderPath) {
  const url = serverUrl(config, folderPath)
  try {
    await fetch(url, { method: 'MKCOL', headers: { Authorization: authHeader(config) } })
  } catch {}
}

export class WebDAVProvider {
  isConnected() { return !!getWebDAVConfig() }

  disconnect() { clearWebDAVConfig() }

  async upload(_bucket, path, file) {
    const config = getWebDAVConfig()
    if (!config) throw new Error('WebDAV not configured')
    const parts = path.split('/')
    if (parts.length > 1) {
      await ensureFolder(config, parts.slice(0, -1).join('/'))
    }
    const url = serverUrl(config, path)
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: authHeader(config), 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!res.ok && res.status !== 201 && res.status !== 204) throw new Error(`WebDAV upload failed: ${res.status}`)
    const ref = `ext:webdav:${path}`
    return { url: ref, ref }
  }

  async resolveUrl(ref) {
    try {
      const config = getWebDAVConfig()
      if (!config) return null
      const path = ref.replace('ext:webdav:', '')
      const res = await fetch(serverUrl(config, path), {
        headers: { Authorization: authHeader(config) },
      })
      if (!res.ok) return null
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    } catch { return null }
  }

  async remove(_bucket, ref) {
    try {
      const config = getWebDAVConfig()
      if (!config) return
      const path = ref.replace('ext:webdav:', '')
      await fetch(serverUrl(config, path), {
        method: 'DELETE',
        headers: { Authorization: authHeader(config) },
      })
    } catch {}
  }

  async testConnection(config) {
    const res = await fetch(config.url.replace(/\/$/, '') + '/', {
      method: 'PROPFIND',
      headers: { Authorization: authHeader(config), Depth: '0' },
    })
    return res.ok || res.status === 207
  }
}
