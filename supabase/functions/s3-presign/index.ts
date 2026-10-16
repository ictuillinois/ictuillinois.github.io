// @ts-nocheck — Deno, not Node.
//
// This file runs on Supabase's Deno runtime. The editor type-checks it with
// Node/browser settings, so it cannot resolve `https://deno.land/...` or
// `npm:` imports and does not know the `Deno` global exists — which it reports
// as errors in a file that deploys and runs correctly. Since it cannot resolve
// the imports it has no types to check against anyway, so its opinion here is
// worth nothing, and a permanent red badge teaches you to ignore real ones.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from 'npm:@aws-sdk/client-s3'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner'
import { createClient } from 'npm:@supabase/supabase-js@2'

const REGION = Deno.env.get('AWS_S3_REGION') ?? 'us-east-1'
const BUCKET = Deno.env.get('AWS_S3_BUCKET') ?? 'ictlab-files'

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') ?? '',
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '',
  },
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Who may ask, and for what (Oct 2026) ──────────────────────────────────
// This function used to hand out read / upload / delete links and folder
// listings for ANY key to ANY caller. The app's public anon key is in the
// website, so anyone could list, download or delete every file in the bucket.
//
// Now: only a SIGNED-IN user (the anon key is not a user), and never a
// reserved folder. `backups/` holds the weekly database backups — everyone's
// data and password hashes — and must never be reachable through the app.
// Keep both checks if you ever change this function.
const RESERVED = ['backups/']

async function signedInUser(req) {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
  })
  const { data, error } = await sb.auth.getUser()
  return error ? null : (data?.user ?? null)
}

// A key the app may use: relative, no "..", not in a reserved folder.
// `allowEmpty`: a list may ask for the whole bucket.
function keyAllowed(key, allowEmpty = false) {
  if (key == null || key === '') return allowEmpty
  if (typeof key !== 'string') return false
  const k = key.trim()
  if (!k) return allowEmpty
  if (k.startsWith('/') || k.includes('..') || k.includes('\\')) return false
  const lower = k.toLowerCase()
  return !RESERVED.some(r => lower === r.slice(0, -1) || lower.startsWith(r))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const user = await signedInUser(req)
    if (!user) return Response.json({ error: 'sign in required' }, { status: 401, headers: CORS })

    const { operation, key, contentType } = await req.json()
    if (!keyAllowed(key, operation === 'list')) {
      return Response.json({ error: 'key not allowed' }, { status: 403, headers: CORS })
    }

    if (operation === 'upload') {
      const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType ?? 'application/octet-stream' })
      const url = await getSignedUrl(s3, cmd, { expiresIn: 300 })
      return Response.json({ url }, { headers: CORS })
    }

    // List what is actually in a prefix. Added because a video that would not
    // play turned out to be a filename mismatch, and there was no way to see
    // the real key short of guessing at it one name at a time. Reserved
    // folders are left out of the result even for a whole-bucket list.
    if (operation === 'list') {
      const out = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET, Prefix: key ?? '', MaxKeys: 200,
      }))
      return Response.json({
        keys: (out.Contents ?? []).filter(o => keyAllowed(o.Key)).map(o => ({ key: o.Key, size: o.Size })),
      }, { headers: CORS })
    }

    if (operation === 'get') {
      const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key })
      const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 })
      return Response.json({ url }, { headers: CORS })
    }

    if (operation === 'delete') {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
      return Response.json({ ok: true }, { headers: CORS })
    }

    return Response.json({ error: 'unknown operation' }, { status: 400, headers: CORS })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: CORS })
  }
})
