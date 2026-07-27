// LocalFolderProvider — uses the File System Access API (Chrome/Edge desktop)
// Stores the chosen FileSystemDirectoryHandle in IndexedDB so it can be
// restored across sessions with a single one-click permission prompt.

const DB_NAME = 'ictlab_local_folder'
const STORE   = 'handles'
const KEY     = 'root'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE)
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

async function saveHandle(handle) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(handle, KEY)
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}

async function loadHandle() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = e => resolve(e.target.result || null)
    req.onerror   = e => reject(e.target.error)
  })
}

async function clearHandle() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}

// Returns true if the browser supports the File System Access API
export function isSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export class LocalFolderProvider {
  constructor() {
    this._handle = null // cached in-memory handle for this session
  }

  isConnected() {
    return !!localStorage.getItem('ictlab_local_folder_set')
  }

  // Let user pick a folder — called once during setup
  async pickFolder() {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' })
    this._handle = handle
    await saveHandle(handle)
    localStorage.setItem('ictlab_local_folder_set', '1')
    return handle
  }

  // Restore handle from IndexedDB and request permission (one click)
  // Returns true if permission granted, false if denied / not supported
  async restoreAndRequestPermission() {
    if (!isSupported()) return false
    try {
      const handle = await loadHandle()
      if (!handle) return false
      const perm = await handle.requestPermission({ mode: 'readwrite' })
      if (perm === 'granted') {
        this._handle = handle
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async _getHandle() {
    if (this._handle) {
      // Verify permission is still valid
      const perm = await this._handle.queryPermission({ mode: 'readwrite' })
      if (perm === 'granted') return this._handle
    }
    // Try restore
    const ok = await this.restoreAndRequestPermission()
    if (ok) return this._handle
    throw new Error('Local folder permission not granted. Open Profile → Storage to reconnect.')
  }

  // Upload: writes file to <folder>/<path-basename>
  async upload(bucket, path, file) {
    const handle = await this._getHandle()
    const name = path.split('/').pop()
    const fileHandle = await handle.getFileHandle(name, { create: true })
    const writable   = await fileHandle.createWritable()
    await writable.write(file)
    await writable.close()
    return { stored: `ext:localfolder:${name}`, url: null }
  }

  // Resolve: reads file from folder, returns an object URL
  async resolveUrl(extRef) {
    const name = extRef.replace(/^ext:localfolder:/, '')
    try {
      const handle = await this._getHandle()
      const fileHandle = await handle.getFileHandle(name)
      const file = await fileHandle.getFile()
      return URL.createObjectURL(file)
    } catch {
      return null
    }
  }

  async remove(_bucket, extRef) {
    const name = extRef.replace(/^ext:localfolder:/, '')
    try {
      const handle = await this._getHandle()
      await handle.removeEntry(name)
    } catch { /* file may already be gone */ }
  }

  async disconnect() {
    this._handle = null
    await clearHandle()
    localStorage.removeItem('ictlab_local_folder_set')
  }
}
