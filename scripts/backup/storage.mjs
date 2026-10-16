// Copies every Supabase Storage file down to a folder, or back up to a project.
//
//   node scripts/backup/storage.mjs download <dir>   (uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//   node scripts/backup/storage.mjs upload   <dir>   (same env, pointing at the project to restore)
//
// <dir>/_buckets.json keeps each bucket's settings (public, size limit, types)
// so a fresh project gets the same buckets back. Files go to <dir>/<bucket>/<path>.
// Prints counts only: the workflow logs of this repo are public.
import fs from 'fs'
import path from 'path'

const [, , mode, dir] = process.argv
const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!mode || !dir || !URL || !KEY) { console.error('usage: storage.mjs download|upload <dir> (with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)'); process.exit(2) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const enc = p => p.split('/').map(encodeURIComponent).join('/')

async function api(method, p, body, extra = {}) {
  const res = await fetch(`${URL}/storage/v1${p}`, { method, headers: { ...H, ...extra }, body })
  if (!res.ok) throw new Error(`${method} ${p.split('/').slice(0, 3).join('/')}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res
}

// Every file under a bucket, walking folders (the list API is one level deep)
async function listAll(bucket, prefix = '') {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const res = await api('POST', `/object/list/${bucket}`, JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }), { 'Content-Type': 'application/json' })
    const items = await res.json()
    for (const it of items) {
      const full = prefix ? `${prefix}/${it.name}` : it.name
      if (it.id === null) out.push(...await listAll(bucket, full))   // a folder
      else out.push({ name: full, type: it.metadata?.mimetype || 'application/octet-stream' })
    }
    if (items.length < 1000) break
  }
  return out
}

async function download() {
  const buckets = await (await api('GET', '/bucket')).json()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '_buckets.json'), JSON.stringify(buckets.map(b => ({
    id: b.id, name: b.name, public: b.public, file_size_limit: b.file_size_limit, allowed_mime_types: b.allowed_mime_types,
  })), null, 2))
  const index = {}
  let files = 0, bytes = 0
  for (const b of buckets) {
    const list = await listAll(b.id)
    index[b.id] = list
    for (const f of list) {
      const res = await api('GET', `/object/${b.id}/${enc(f.name)}`)
      const buf = Buffer.from(await res.arrayBuffer())
      const dest = path.join(dir, b.id, f.name)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, buf)
      files++; bytes += buf.length
    }
  }
  fs.writeFileSync(path.join(dir, '_index.json'), JSON.stringify(index, null, 2))
  fs.writeFileSync(path.join(dir, '_totals.json'), JSON.stringify({ buckets: buckets.length, files, bytes }))
  console.log(`storage: ${buckets.length} buckets, ${files} files, ${(bytes / 1048576).toFixed(1)} MB`)
}

async function upload() {
  const buckets = JSON.parse(fs.readFileSync(path.join(dir, '_buckets.json'), 'utf8'))
  const index = JSON.parse(fs.readFileSync(path.join(dir, '_index.json'), 'utf8'))
  const have = new Set((await (await api('GET', '/bucket')).json()).map(b => b.id))
  for (const b of buckets) {
    if (have.has(b.id)) continue
    await api('POST', '/bucket', JSON.stringify(b), { 'Content-Type': 'application/json' })
  }
  let files = 0
  for (const b of buckets) {
    for (const f of index[b.id] || []) {
      const src = path.join(dir, b.id, f.name)
      if (!fs.existsSync(src)) continue
      // x-upsert: the file may already be there (restoring over the same project)
      await api('POST', `/object/${b.id}/${enc(f.name)}`, fs.readFileSync(src), { 'Content-Type': f.type, 'x-upsert': 'true' })
      files++
    }
  }
  console.log(`storage: ${files} files restored into ${buckets.length} buckets`)
}

await (mode === 'download' ? download() : mode === 'upload' ? upload() : Promise.reject(new Error('mode must be download or upload')))
