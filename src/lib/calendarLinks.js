// "Add to calendar" helpers for equipment bookings — Phase 1 of calendar
// integration. No OAuth, no APIs: Google/Outlook use their public template
// URLs, and the .ics download covers Apple Calendar, desktop Outlook and
// everything else. Google/Outlook URLs carry UTC times (converted to the
// viewer's zone by the calendar app); description text is formatted in the
// generating user's local timezone.
//
// ctx: { eqName, orgName, location, bookedBy }
//   eqName   — equipment nickname/name
//   orgName  — organization name ('' for solo users → no prefix)
//   location — equipment_inventory.location (e.g. "MPF - Aggregate hall")
//   bookedBy — booking.user_name

const BOOKING_URL = 'https://ictlab.app/?screen=booking'

function toCalUtc(iso) {
  // 2026-07-17T14:30:00.000Z -> 20260717T143000Z
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function summary(ctx) {
  const prefix = ctx.orgName ? `${ctx.orgName} - ` : ''
  return `${prefix}Lab booking: ${ctx.eqName || 'Equipment'}`
}

function fullLocation(ctx) {
  return [ctx.orgName, ctx.location].filter(Boolean).join(' - ')
}

function descriptionParts(booking, ctx) {
  const s = new Date(booking.start_time), e = new Date(booking.end_time)
  const day = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const tm = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const sameDay = s.toDateString() === e.toDateString()
  const when = sameDay
    ? `between ${tm(s)} and ${tm(e)} on ${day(s)}`
    : `from ${tm(s)} on ${day(s)} until ${tm(e)} on ${day(e)}`
  const who = ctx.bookedBy || 'A lab user'
  const purpose = booking.title ? ` for ${booking.title}` : ''

  const parts = [
    `${who} booked ${ctx.eqName || 'equipment'}${purpose} ${when}.`,
  ]
  if (booking.notes) parts.push(`Notes: ${booking.notes}`)
  parts.push(`This reminder was sent to ${who} from ICT-Lab.app.`)
  return parts
}

// Plain-text body: bare URL on its own line (Outlook auto-links it on save)
function description(booking, ctx) {
  return [
    ...descriptionParts(booking, ctx),
    'The link below will guide you to the booking page on the website or app:',
    BOOKING_URL,
  ].join('\n')
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// HTML body: real clickable anchor (Google Calendar details + ICS X-ALT-DESC)
function descriptionHtml(booking, ctx) {
  return descriptionParts(booking, ctx).map(p => escHtml(p)).join('<br>') +
    `<br><a href="${BOOKING_URL}">Open the booking page in ICT-Lab →</a>`
}

export function googleCalUrl(booking, ctx) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary(ctx),
    dates: `${toCalUtc(booking.start_time)}/${toCalUtc(booking.end_time)}`,
    details: descriptionHtml(booking, ctx),   // Google renders HTML — clickable link
  })
  const loc = fullLocation(ctx)
  if (loc) p.set('location', loc)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

export function outlookCalUrl(booking, ctx) {
  const p = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: summary(ctx),
    startdt: new Date(booking.start_time).toISOString(),
    enddt: new Date(booking.end_time).toISOString(),
    body: description(booking, ctx),
  })
  const loc = fullLocation(ctx)
  if (loc) p.set('location', loc)
  // outlook.office.com handles work/school accounts; personal accounts get
  // redirected by Microsoft to outlook.live.com automatically.
  return `https://outlook.office.com/calendar/0/deeplink/compose?${p.toString()}`
}

// Escape per RFC 5545: backslash, semicolon, comma, newline
function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

export function downloadIcs(booking, ctx) {
  const loc = fullLocation(ctx)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ICT-Lab//Equipment Booking//EN',
    'BEGIN:VEVENT',
    `UID:booking-${booking.id}@ictlab.app`,
    `DTSTAMP:${toCalUtc(new Date().toISOString())}`,
    `DTSTART:${toCalUtc(booking.start_time)}`,
    `DTEND:${toCalUtc(booking.end_time)}`,
    `SUMMARY:${icsEscape(summary(ctx))}`,
    ...(loc ? [`LOCATION:${icsEscape(loc)}`] : []),
    `DESCRIPTION:${icsEscape(description(booking, ctx))}`,
    // HTML alternative — Outlook/Google render this with a clickable link
    `X-ALT-DESC;FMTTYPE=text/html:${icsEscape(`<html><body>${descriptionHtml(booking, ctx)}</body></html>`)}`,
    `URL:${BOOKING_URL}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ictlab-booking-${(ctx.eqName || 'equipment').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
