// Migration: pro-ilab → ilab
// Transfers rooms + supplies + photos for the ICT organization
import { createClient } from '@supabase/supabase-js'

const OLD_URL = 'https://lxjudxjcxhrynnlxodtg.supabase.co'
const OLD_KEY = 'sb_publishable__xMbRgZhwKSq_7qKi3KGJg_6AJkaR7A'
const NEW_URL = 'https://qhsxtpywfczqopcimykk.supabase.co'
const NEW_KEY = 'sb_publishable_eXj0rGtAqMRX2Q3B9kgc1w_CE8rzWei'
const ICT_ORG_ID = '5bab5b33-fff9-4a4a-b617-3dac179f9678'

const oldSb = createClient(OLD_URL, OLD_KEY)
const newSb = createClient(NEW_URL, NEW_KEY)

// Download a photo from old URL and upload to new item-photos bucket
async function transferPhoto(oldUrl, newPath) {
  try {
    const res = await fetch(oldUrl)
    if (!res.ok) { console.warn(`  ⚠ Could not download (${res.status}): ${oldUrl}`); return null }
    const arrayBuf = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuf)
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const { error } = await newSb.storage.from('item-photos').upload(newPath, buffer, { contentType, upsert: true })
    if (error) { console.warn(`  ⚠ Upload failed for ${newPath}: ${error.message}`); return null }
    const { data } = newSb.storage.from('item-photos').getPublicUrl(newPath)
    return data.publicUrl
  } catch (e) {
    console.warn(`  ⚠ Photo transfer error: ${e.message} | URL: ${oldUrl}`)
    return null
  }
}

async function migrate() {
  console.log('=== iLab Supply Migration ===\n')

  // ── 1. Fetch rooms from old DB ─────────────────────────────
  const { data: oldRooms, error: rErr } = await oldSb.from('rooms').select('*').eq('login_mode', 'team')
  if (rErr) { console.error('Failed to fetch old rooms:', rErr.message); process.exit(1) }
  console.log(`Found ${oldRooms.length} rooms in pro-ilab\n`)

  // ── 2. Upsert rooms → build old_id → new_id mapping ───────
  const roomIdMap = {}
  for (const room of oldRooms) {
    // Match by name in new DB (for the ICT org)
    const { data: existing } = await newSb.from('rooms').select('id')
      .eq('name', room.name).eq('login_mode', 'team').eq('organization_id', ICT_ORG_ID).limit(1)

    if (existing?.[0]) {
      roomIdMap[room.id] = existing[0].id
      console.log(`  ✓ Room "${room.name}" already exists → ${existing[0].id}`)

      // Update photo if missing in new DB
      const { data: newRoom } = await newSb.from('rooms').select('photo_url').eq('id', existing[0].id).single()
      if (!newRoom?.photo_url && room.photo_url) {
        const ext = room.photo_url.split('.').pop().split('?')[0]
        const newPhotoUrl = await transferPhoto(room.photo_url, `room_${existing[0].id}_migrated.${ext}`)
        if (newPhotoUrl) {
          await newSb.from('rooms').update({ photo_url: newPhotoUrl }).eq('id', existing[0].id)
          console.log(`    → photo transferred`)
        }
      }
    } else {
      // Insert new room (without photo first, then update)
      const { data: inserted, error: iErr } = await newSb.from('rooms').insert({
        name: room.name,
        icon: room.icon,
        login_mode: 'team',
        organization_id: ICT_ORG_ID,
      }).select('id').single()
      if (iErr) { console.error(`  ✗ Failed to insert room "${room.name}": ${iErr.message}`); continue }

      roomIdMap[room.id] = inserted.id
      console.log(`  + Created room "${room.name}" → ${inserted.id}`)

      if (room.photo_url) {
        const ext = room.photo_url.split('.').pop().split('?')[0]
        const newPhotoUrl = await transferPhoto(room.photo_url, `room_${inserted.id}_migrated.${ext}`)
        if (newPhotoUrl) {
          await newSb.from('rooms').update({ photo_url: newPhotoUrl }).eq('id', inserted.id)
          console.log(`    → photo transferred`)
        }
      }
    }
  }

  // ── 3. Fetch supplies from old DB ──────────────────────────
  console.log('\n--- Supplies ---')

  // Quick URL test before main loop
  {
    const { data: testSupply } = await oldSb.from('supplies').select('name, photo_url').not('photo_url', 'is', null).limit(1)
    if (testSupply?.[0]?.photo_url) {
      console.log(`\nTest URL: ${testSupply[0].photo_url}`)
      try {
        const r = await fetch(testSupply[0].photo_url)
        console.log(`Test fetch status: ${r.status} ${r.statusText}\n`)
      } catch (e) {
        console.log(`Test fetch error: ${e.message}\n`)
      }
    }
  }
  const { data: oldSupplies, error: sErr } = await oldSb.from('supplies').select('*')
  if (sErr) { console.error('Failed to fetch old supplies:', sErr.message); process.exit(1) }
  console.log(`Found ${oldSupplies.length} supplies in pro-ilab\n`)

  let created = 0, updated = 0, skipped = 0, photosMigrated = 0

  for (const supply of oldSupplies) {
    const newRoomId = roomIdMap[supply.room_id]
    if (!newRoomId) {
      console.warn(`  ⚠ Skipping "${supply.name}" — no room mapping for room_id ${supply.room_id}`)
      skipped++
      continue
    }

    // Transfer photo if it points to old storage
    let photoUrl = supply.photo_url
    if (supply.photo_url && !supply.photo_url.includes('qhsxtpywfczqopcimykk')) {
      const ext = supply.photo_url.split('.').pop().split('?')[0] || 'jpg'
      const safeName = supply.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
      const newPhotoUrl = await transferPhoto(supply.photo_url, `${supply.id}_${safeName}.${ext}`)
      if (newPhotoUrl) { photoUrl = newPhotoUrl; photosMigrated++ }
      else photoUrl = null
    }

    const payload = {
      room_id: newRoomId,
      name: supply.name,
      unit: supply.unit || null,
      min_qty: supply.min_qty ?? 0,
      qty: supply.qty ?? 0,
      notes: supply.notes || null,
      photo_url: photoUrl,
      links: supply.links || null,
      login_mode: 'team',
      organization_id: ICT_ORG_ID,
    }

    // Check if supply already exists by name in the same room
    const { data: existing } = await newSb.from('supplies').select('id')
      .eq('name', supply.name).eq('room_id', newRoomId).limit(1)

    if (existing?.[0]) {
      const { error } = await newSb.from('supplies').update(payload).eq('id', existing[0].id)
      if (error) console.error(`  ✗ Update failed for "${supply.name}": ${error.message}`)
      else { console.log(`  ✓ Updated "${supply.name}"`); updated++ }
    } else {
      const { error } = await newSb.from('supplies').insert(payload)
      if (error) console.error(`  ✗ Insert failed for "${supply.name}": ${error.message}`)
      else { console.log(`  + Created "${supply.name}"`); created++ }
    }
  }

  console.log(`
=== Migration Complete ===
Rooms:    ${Object.keys(roomIdMap).length} / ${oldRooms.length} mapped
Supplies: ${created} created, ${updated} updated, ${skipped} skipped
Photos:   ${photosMigrated} transferred
`)
}

migrate().catch(err => { console.error('Fatal:', err); process.exit(1) })
