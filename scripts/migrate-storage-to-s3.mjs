/**
 * migrate-storage-to-s3.mjs
 * Migrates all files from Supabase Storage → AWS S3 (ictlab-files bucket)
 * Updates DB records (photo_url, file_url, photos arrays, etc.) to use ext:s3: refs
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<your-service-role-key> node scripts/migrate-storage-to-s3.mjs
 *
 * Get your service role key:
 *   Supabase Dashboard → ilqnwprvxwbhvrjstwsd → Settings → API → service_role (secret)
 */

import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

const SUPABASE_URL     = 'https://ilqnwprvxwbhvrjstwsd.supabase.co'
const SUPABASE_ANON    = 'sb_publishable_HEl1HIKUs2vVmqa16LZhlQ_EwciS1M8'
const SERVICE_KEY      = process.env.SUPABASE_SERVICE_KEY || ''
const AWS_BUCKET       = 'ictlab-files'
const AWS_REGION       = 'us-east-1'
const AWS_ACCESS_KEY   = process.env.AWS_ACCESS_KEY_ID   || ''
const AWS_SECRET_KEY   = process.env.AWS_SECRET_ACCESS_KEY || ''

if (!SERVICE_KEY) {
  console.error('ERROR: set SUPABASE_SERVICE_KEY env var before running.')
  console.error('Get it from: Supabase Dashboard → Settings → API → service_role')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY)
const s3 = new S3Client({
  region: AWS_REGION,
  credentials: { accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY },
})

// All Supabase storage buckets to migrate
const BUCKETS = ['project-files', 'project-records', 'item-photos', 'task-files', 'lab-files']

// DB tables + columns that store Supabase Storage URLs
// column type: 'text' | 'array' | 'jsonb'
const DB_COLUMNS = [
  { table: 'supplies',           column: 'photo_url',    type: 'text'  },
  { table: 'rooms',              column: 'photo_url',    type: 'text'  },
  { table: 'users',              column: 'photo_url',    type: 'text'  },
  { table: 'users',              column: 'avatar',       type: 'text'  },
  { table: 'solo_users',         column: 'photo_url',    type: 'text'  },
  { table: 'solo_users',         column: 'avatar',       type: 'text'  },
  { table: 'task_attachments',   column: 'file_url',     type: 'text'  },
  { table: 'project_materials',  column: 'photos',       type: 'array' },
  { table: 'training_fresh',     column: 'file_url',     type: 'text'  },
  { table: 'training_golf_car',  column: 'file_url',     type: 'text'  },
  { table: 'training_equipment', column: 'file_url',     type: 'text'  },
  { table: 'training_building_alarm', column: 'file_url',type: 'text'  },
  { table: 'equipment',          column: 'photo_url',    type: 'text'  },
  { table: 'equipment',          column: 'sop_url',      type: 'text'  },
  { table: 'equipment_hub_items',column: 'file_url',     type: 'text'  },
  { table: 'organizations',      column: 'module_images',type: 'jsonb' },
  { table: 'settings',           column: 'value',        type: 'text'  },
  { table: 'project_results',    column: 'file_url',     type: 'text'  },
  { table: 'project_links',      column: 'file_url',     type: 'text'  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function supabasePublicUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

function s3Ref(bucket, path) {
  return `ext:s3:${bucket}/${path}`
}

async function listAllFiles(bucket, prefix = '') {
  const files = []
  let offset = 0
  while (true) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) { console.warn(`  list error in ${bucket}/${prefix}:`, error.message); break }
    if (!data?.length) break
    for (const item of data) {
      if (item.id) {
        // It's a file
        files.push(prefix ? `${prefix}/${item.name}` : item.name)
      } else {
        // It's a folder — recurse
        const sub = prefix ? `${prefix}/${item.name}` : item.name
        const subFiles = await listAllFiles(bucket, sub)
        files.push(...subFiles)
      }
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return files
}

async function s3KeyExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: AWS_BUCKET, Key: key }))
    return true
  } catch { return false }
}

async function migrateFile(bucket, path) {
  const s3Key = `${bucket}/${path}`
  if (await s3KeyExists(s3Key)) {
    console.log(`  SKIP (already in S3): ${s3Key}`)
    return { old: supabasePublicUrl(bucket, path), new: s3Ref(bucket, path) }
  }

  const publicUrl = supabasePublicUrl(bucket, path)
  const res = await fetch(publicUrl)
  if (!res.ok) {
    console.warn(`  WARN: could not download ${publicUrl} (${res.status})`)
    return null
  }

  const body = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'application/octet-stream'

  await s3.send(new PutObjectCommand({
    Bucket: AWS_BUCKET,
    Key: s3Key,
    Body: body,
    ContentType: contentType,
  }))

  console.log(`  ✓ ${s3Key}`)
  return { old: publicUrl, new: s3Ref(bucket, path) }
}

async function updateTextColumn(table, column, oldUrl, newRef) {
  const { error } = await sb.from(table).update({ [column]: newRef }).eq(column, oldUrl)
  if (error && !error.message.includes('does not exist')) {
    console.warn(`    DB warn ${table}.${column}:`, error.message)
  }
}

async function updateArrayColumn(table, column, oldUrl, newRef) {
  // Replace oldUrl inside any array element using Postgres array_replace
  const { error } = await sb.rpc('array_replace_text', {
    p_table: table, p_column: column, p_old: oldUrl, p_new: newRef
  })
  if (error && !error.message.includes('does not exist')) {
    console.warn(`    DB warn ${table}.${column} (array):`, error.message)
  }
}

async function updateJsonbColumn(table, column, oldUrl, newRef) {
  // Fetch all rows containing the old URL in the JSONB value
  const { data, error } = await sb.from(table).select(`id, ${column}`)
  if (error) { console.warn(`    jsonb fetch error ${table}.${column}:`, error.message); return }
  for (const row of (data || [])) {
    const json = row[column]
    if (!json) continue
    const str = JSON.stringify(json)
    if (!str.includes(oldUrl)) continue
    const updated = JSON.parse(str.replaceAll(oldUrl, newRef))
    await sb.from(table).update({ [column]: updated }).eq('id', row.id)
    console.log(`    updated JSONB ${table}.${column} row ${row.id}`)
  }
}

async function updateDb(urlMappings) {
  console.log('\n── Updating DB references ───────────────────────────────')
  for (const { old: oldUrl, new: newRef } of urlMappings) {
    for (const { table, column, type } of DB_COLUMNS) {
      if (type === 'text')  await updateTextColumn(table, column, oldUrl, newRef)
      if (type === 'array') await updateArrayColumn(table, column, oldUrl, newRef)
      if (type === 'jsonb') await updateJsonbColumn(table, column, oldUrl, newRef)
    }
  }
  console.log('DB update complete.')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const urlMappings = []
  let totalFiles = 0
  let skipped = 0
  let failed = 0

  for (const bucket of BUCKETS) {
    console.log(`\n── Bucket: ${bucket} ─────────────────────────────────────`)
    let files
    try {
      files = await listAllFiles(bucket)
    } catch (e) {
      console.warn(`  Could not list bucket ${bucket}:`, e.message)
      continue
    }
    console.log(`  Found ${files.length} files`)

    for (const path of files) {
      totalFiles++
      const result = await migrateFile(bucket, path)
      if (!result) { failed++; continue }
      if (result) urlMappings.push(result)
      if (result.new === result.old) skipped++
    }
  }

  console.log(`\n── File migration done ───────────────────────────────────`)
  console.log(`  Total: ${totalFiles} | Migrated: ${urlMappings.length - skipped} | Skipped: ${skipped} | Failed: ${failed}`)

  if (urlMappings.length > 0) {
    await updateDb(urlMappings)
  }

  console.log('\n✅ Migration complete. Verify a few files in the AWS console.')
  console.log('   Note: array column updates need the array_replace_text RPC (see below).')
}

main().catch(e => { console.error(e); process.exit(1) })
