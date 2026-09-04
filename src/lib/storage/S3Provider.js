import { sb } from '../supabase'

const SUPABASE_URL = 'https://ilqnwprvxwbhvrjstwsd.supabase.co'
const PRESIGN_FN  = `${SUPABASE_URL}/functions/v1/s3-presign`

async function presign(operation, key, contentType) {
  const { data: { session } } = await sb.auth.getSession()
  const res = await fetch(PRESIGN_FN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ operation, key, contentType }),
  })
  if (!res.ok) throw new Error(`s3-presign error: ${res.status}`)
  return res.json()
}

// Supabase "bucket" names become folder prefixes inside the single AWS bucket.
// Stored refs use format:  ext:s3:<bucket>/<path>
// e.g. ext:s3:project-files/org123/photo.jpg

export class S3Provider {
  async upload(bucket, path, file) {
    const key = `${bucket}/${path}`
    const { url } = await presign('upload', key, file.type || 'application/octet-stream')

    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) throw new Error(`S3 direct upload failed: ${res.status}`)

    const ref = `ext:s3:${key}`
    return { url: ref, ref }
  }

  async resolveUrl(extRef) {
    // extRef = "ext:s3:project-files/org123/photo.jpg"
    const key = extRef.replace(/^ext:s3:/, '')
    const { url } = await presign('get', key)
    return url
  }

  async remove(_bucket, extRef) {
    const key = extRef.replace(/^ext:s3:/, '')
    await presign('delete', key)
  }

  isConnected() { return true }
}
