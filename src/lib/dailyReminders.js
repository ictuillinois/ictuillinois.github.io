import { sb } from './supabase'
import { useAppStore } from '../store/useAppStore'
import { sendTaskNotification } from './notify'

// Daily task reminders, browser side.
//
// The scheduled job (supabase/functions/daily-reminders) is what delivers
// these properly — at 7am, whether or not anyone has the app open. This runs
// the same checks on login and exists as a fallback: if the cron is not
// installed on a project, or a run fails, a user who opens the app still gets
// their reminder instead of silently getting nothing.
//
// Both write to reminder_sends first and only send if the insert succeeded.
// The unique index makes that claim atomic, so whichever gets there first
// sends and the other finds the day already claimed. That is also why the old
// localStorage marker had to go: it was per browser, so a laptop and a phone
// each sent their own copy.

const todayStr = () => {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

// True only if THIS caller owns the send. 23505 = someone already claimed it.
// Any other error means do not send: sending without a record is what produces
// a duplicate every single time the app is opened.
async function claim(userId, kind, refId, sentFor, orgId) {
  const { error } = await sb.from('reminder_sends')
    .insert({ user_id: userId, kind, ref_id: refId, sent_for: sentFor, organization_id: orgId })
  if (!error) return true
  if (error.code !== '23505') console.warn('[dailyReminders] claim failed:', error.message)
  return false
}

// ── Equipment maintenance (same stages as the Edge Function — keep in step) ──
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const daysUntil = (due, today) => Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
const days = n => `${n} day${n === 1 ? '' : 's'}`
export function maintenanceStage(due, today) {
  const d = daysUntil(due, today)
  if (d > 14) return null
  if (d > 7) return { kind: 'maint_2weeks', sentFor: due, title: `Maintenance due in ${d === 14 ? '2 weeks' : days(d)}` }
  if (d > 0) return { kind: 'maint_1week', sentFor: due, title: d === 1 ? 'Maintenance due tomorrow' : `Maintenance due in ${d === 7 ? '1 week' : days(d)}` }
  if (d > -7) return { kind: 'maint_due', sentFor: due, title: d === 0 ? 'Maintenance due today' : `Maintenance overdue by ${days(-d)}` }
  const weeks = Math.floor(-d / 7)
  return { kind: 'maint_overdue', sentFor: addDays(due, weeks * 7), title: `Maintenance overdue by ${weeks} week${weeks === 1 ? '' : 's'}` }
}

// The signed-in person's own maintenance reminders: equipment where they are
// ticked Remind under Responsible for Maintenance. Claims through the same
// reminder_sends rows as the Edge Function, so whichever runs first sends.
export async function runMaintenanceReminders() {
  const session = useAppStore.getState?.().session
  const userId = session?.userId
  if (!userId) return
  const today = todayStr()
  const { data: eqs, error } = await sb.from('equipment_inventory')
    .select('id, equipment_name, nickname, next_maintenance_date, maintenance_assignees, organization_id')
    .eq('is_active', true).not('next_maintenance_date', 'is', null)
    .lte('next_maintenance_date', addDays(today, 14))
  if (error) { console.warn('[maintenanceReminders] load failed:', error.message); return }
  for (const eq of eqs || []) {
    const mine = (Array.isArray(eq.maintenance_assignees) ? eq.maintenance_assignees : [])
      .some(a => String(a?.id) === String(userId) && a.remind === true)
    if (!mine) continue
    const stage = maintenanceStage(eq.next_maintenance_date, today)
    if (!stage) continue
    if (!await claim(userId, stage.kind, eq.id, stage.sentFor, eq.organization_id || session?.organizationId || null)) continue
    const name = eq.equipment_name || eq.nickname || 'Equipment'
    const when = new Date(`${eq.next_maintenance_date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    await sendTaskNotification(userId, 'maintenance_reminder', `🔧 ${stage.title}: ${name}`,
      `${name} is due for maintenance on ${when}. You are listed as responsible for its maintenance.`, null,
      { label: 'Open Equipment & Maintenance →', url: 'https://ictlab.labhive.app?screen=equipment' })
  }
}

export async function runDailyTaskReminders() {
  const session = useAppStore.getState?.().session
  const userId = session?.userId
  if (!userId) return                       // super admin has no user row to notify
  const orgId = session?.organizationId || null
  const today = todayStr()

  const { data: tasks, error } = await sb
    .from('tasks')
    .select('id, title, deadline, start_date, status, assigned_to, created_by')
    .eq('remind_daily', true)
    .neq('status', 'done')
    .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
  if (error) { console.warn('[dailyReminders] load failed:', error.message); return }

  // Not started yet = no daily nag. Filtered here rather than in the query:
  // a second .or() alongside the assigned_to/created_by one is ambiguous.
  const open = (tasks || []).filter(t => !t.start_date || t.start_date <= today)
  if (open.length && await claim(userId, 'daily_tasks', null, today, orgId)) {
    const overdue = open.filter(t => t.deadline && t.deadline < today).length
    const dueToday = open.filter(t => t.deadline === today).length
    const bits = []
    if (dueToday) bits.push(`${dueToday} due today`)
    if (overdue) bits.push(`${overdue} overdue`)
    const title = open.length === 1 ? `Daily reminder: ${open[0].title}` : `Daily reminder: ${open.length} tasks`
    const body = (bits.length ? bits.join(' · ') + ' — ' : '')
      + open.slice(0, 4).map(t => t.title).join(', ')
      + (open.length > 4 ? `, +${open.length - 4} more` : '')
    await sendTaskNotification(userId, 'reminder_daily', title, body, open.length === 1 ? open[0].id : null)
  }

  // "Due tomorrow" used to fire only from the My Tasks list, so you got it
  // only on days you happened to open that one tab.
  const t = new Date(); t.setDate(t.getDate() + 1)
  const tomorrow = [t.getFullYear(), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0')].join('-')
  const { data: soon } = await sb
    .from('tasks')
    .select('id, title')
    .eq('deadline', tomorrow)
    .neq('status', 'done')
    .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
  for (const task of soon || []) {
    if (!await claim(userId, 'deadline_tomorrow', task.id, today, orgId)) continue
    await sendTaskNotification(userId, 'deadline_reminder', '⏰ Task due tomorrow', `"${task.title}" is due tomorrow`, task.id)
  }
}
