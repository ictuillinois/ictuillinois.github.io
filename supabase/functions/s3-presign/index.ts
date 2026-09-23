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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { operation, key, contentType } = await req.json()

    if (operation === 'upload') {
      const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType ?? 'application/octet-stream' })
      const url = await getSignedUrl(s3, cmd, { expiresIn: 300 })
      return Response.json({ url }, { headers: CORS })
    }

    // List what is actually in a prefix. Added because a video that would not
    // play turned out to be a filename mismatch, and there was no way to see
    // the real key short of guessing at it one name at a time.
    if (operation === 'list') {
      const out = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET, Prefix: key ?? '', MaxKeys: 200,
      }))
      return Response.json({
        keys: (out.Contents ?? []).map(o => ({ key: o.Key, size: o.Size })),
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
