import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3'
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
