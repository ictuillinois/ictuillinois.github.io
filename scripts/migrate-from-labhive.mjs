/**
 * migrate-from-labhive.mjs
 *
 * Migrates ICT org data from labhive → ictlab.
 * Priority: supply inventory (rooms + supplies) and equipment inventory.
 * Also migrates: equipment categories, locations, calibration, details, inspections.
 *
 * Usage:
 *   LABHIVE_SERVICE_KEY=<key> ICTLAB_SERVICE_KEY=<key> node scripts/migrate-from-labhive.mjs
 *
 * Get service role keys from Supabase dashboard → Settings → API → service_role key.
 * (NOT the anon key — service role bypasses RLS and can read all org data.)
 */

import { createClient } from '@supabase/supabase-js'

// ── Connection config ──────────────────────────────────────────────────────────
const LABHIVE_URL = 'https://qhsxtpywfczqopcimykk.supabase.co'
const ICTLAB_URL  = 'https://ilqnwprvxwbhvrjstwsd.supabase.co'

// ── Paste your service role keys here ─────────────────────────────────────────
// Get from: Supabase dashboard → Settings → API → service_role key
const LABHIVE_SERVICE_KEY = process.env.LABHIVE_SERVICE_KEY || 'PASTE_LABHIVE_SERVICE_ROLE_KEY_HERE'
const ICTLAB_SERVICE_KEY  = process.env.ICTLAB_SERVICE_KEY  || 'PASTE_ICTLAB_SERVICE_ROLE_KEY_HERE'

if (LABHIVE_SERVICE_KEY.startsWith('PASTE') || ICTLAB_SERVICE_KEY.startsWith('PASTE')) {
  console.error('Edit scripts/migrate-from-labhive.mjs and paste your service role keys into the two constants at the top.')
  process.exit(1)
}

const src = createClient(LABHIVE_URL, LABHIVE_SERVICE_KEY)
const dst = createClient(ICTLAB_URL,  ICTLAB_SERVICE_KEY)

const ICT_ORG_ID = '5bab5b33-fff9-4a4a-b617-3dac179f9678'

// ── Helpers ────────────────────────────────────────────────────────────────────
function log(msg) { console.log(`  ${msg}`) }
function section(title) { console.log(`\n── ${title} ──`) }

async function getIctlabOrgId() {
  const { data, error } = await dst.from('organizations').select('id, name').limit(1).single()
  if (error || !data) throw new Error('Could not find organization in ictlab: ' + (error?.message || 'no rows'))
  log(`ictlab org: "${data.name}" (${data.id})`)
  return data.id
}

async function read(client, table, filters = {}) {
  let q = client.from(table).select('*')
  for (const [col, val] of Object.entries(filters)) {
    if (Array.isArray(val)) q = q.in(col, val)
    else q = q.eq(col, val)
  }
  const { data, error } = await q
  if (error) throw new Error(`Read ${table}: ${error.message}`)
  return data || []
}

async function insertBatch(table, rows, label) {
  if (!rows.length) { log(`${label}: nothing to insert`); return }
  const { error } = await dst.from(table).insert(rows)
  if (error) throw new Error(`Insert ${table}: ${error.message}`)
  log(`${label}: inserted ${rows.length} rows`)
}

// ── Main migration ─────────────────────────────────────────────────────────────
async function migrate() {
  console.log('=== labhive → ictlab migration ===')
  console.log(`Source org: ${ICT_ORG_ID}`)

  const dstOrgId = await getIctlabOrgId()

  // ── 1. Rooms ────────────────────────────────────────────────────────────────
  section('Rooms (supply inspection)')
  const srcRooms = await read(src, 'rooms', { organization_id: ICT_ORG_ID, login_mode: 'team' })
  log(`Found ${srcRooms.length} rooms in labhive`)

  const roomIdMap = {}  // oldId → newId
  for (const room of srcRooms) {
    const { id: oldId, ...rest } = room
    const payload = { ...rest, organization_id: dstOrgId, login_mode: 'team' }
    const { data, error } = await dst.from('rooms').insert(payload).select('id').single()
    if (error) { console.warn(`  ⚠ Room "${room.name}": ${error.message}`); continue }
    roomIdMap[oldId] = data.id
    log(`  Room "${room.name}": ${oldId} → ${data.id}`)
  }

  // ── 2. Supplies ─────────────────────────────────────────────────────────────
  section('Supplies')
  const srcSupplies = await read(src, 'supplies', { organization_id: ICT_ORG_ID, login_mode: 'team' })
  log(`Found ${srcSupplies.length} supplies in labhive`)

  const supplyRows = srcSupplies.map(({ id, room_id, ...rest }) => ({
    ...rest,
    organization_id: dstOrgId,
    login_mode: 'team',
    room_id: roomIdMap[room_id] || null,
  }))
  await insertBatch('supplies', supplyRows, 'Supplies')

  // ── 3. Inspections (supply records) ─────────────────────────────────────────
  section('Inspections (supply records)')
  const srcInspections = await read(src, 'inspections', { organization_id: ICT_ORG_ID })
  log(`Found ${srcInspections.length} inspection records`)

  const inspectionRows = srcInspections.map(({ id, room_id, ...rest }) => ({
    ...rest,
    organization_id: dstOrgId,
    room_id: roomIdMap[room_id] || null,
  }))
  await insertBatch('inspections', inspectionRows, 'Inspections')

  // ── 4. Equipment categories ──────────────────────────────────────────────────
  section('Equipment categories')
  const srcCats = await read(src, 'equipment_categories', { organization_id: ICT_ORG_ID })
  log(`Found ${srcCats.length} categories`)
  const catRows = srcCats.map(({ id, ...rest }) => ({ ...rest, organization_id: dstOrgId }))
  await insertBatch('equipment_categories', catRows, 'Equipment categories')

  // ── 5. Equipment locations ───────────────────────────────────────────────────
  section('Equipment locations')
  const srcLocs = await read(src, 'equipment_locations', { organization_id: ICT_ORG_ID })
  log(`Found ${srcLocs.length} locations`)
  const locRows = srcLocs.map(({ id, ...rest }) => ({ ...rest, organization_id: dstOrgId }))
  await insertBatch('equipment_locations', locRows, 'Equipment locations')

  // ── 6. Equipment inventory ───────────────────────────────────────────────────
  section('Equipment inventory')
  const srcEquip = await read(src, 'equipment_inventory', { organization_id: ICT_ORG_ID, login_mode: 'team' })
  log(`Found ${srcEquip.length} equipment items`)

  const equipIdMap = {}  // oldId → newId
  for (const item of srcEquip) {
    const { id: oldId, ...rest } = item
    const payload = { ...rest, organization_id: dstOrgId, login_mode: 'team' }
    const { data, error } = await dst.from('equipment_inventory').insert(payload).select('id').single()
    if (error) { console.warn(`  ⚠ Equipment "${item.equipment_name}": ${error.message}`); continue }
    equipIdMap[oldId] = data.id
    log(`  "${item.equipment_name}": ${oldId} → ${data.id}`)
  }

  // ── 7. Equipment details (photos) ────────────────────────────────────────────
  section('Equipment details (photos)')
  const srcEqIds = Object.keys(equipIdMap)
  if (srcEqIds.length) {
    const srcDetails = await read(src, 'equipment_details', { equipment_id: srcEqIds })
    log(`Found ${srcDetails.length} detail rows`)
    const detailRows = srcDetails
      .filter(d => equipIdMap[d.equipment_id])
      .map(({ id, equipment_id, ...rest }) => ({ ...rest, equipment_id: equipIdMap[equipment_id] }))
    await insertBatch('equipment_details', detailRows, 'Equipment details')
  } else {
    log('No equipment migrated, skipping details')
  }

  // ── 8. Equipment calibration ─────────────────────────────────────────────────
  section('Equipment calibration')
  if (srcEqIds.length) {
    const srcCal = await read(src, 'equipment_calibration', { equipment_id: srcEqIds })
    log(`Found ${srcCal.length} calibration records`)
    const calRows = srcCal
      .filter(c => equipIdMap[c.equipment_id])
      .map(({ id, equipment_id, organization_id, ...rest }) => ({
        ...rest,
        equipment_id: equipIdMap[equipment_id],
        organization_id: dstOrgId,
      }))
    await insertBatch('equipment_calibration', calRows, 'Calibration records')
  } else {
    log('No equipment migrated, skipping calibration')
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n=== Done ===')
  console.log(`Rooms migrated:     ${Object.keys(roomIdMap).length}`)
  console.log(`Equipment migrated: ${Object.keys(equipIdMap).length}`)
  console.log('\nSupply and equipment data is now in ictlab.')
  console.log('Photos (stored in labhive Supabase Storage) still point to labhive URLs — they will display fine since they are public.')
}

migrate().catch(e => { console.error('\nMigration failed:', e.message); process.exit(1) })
