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

export async function runDailyTaskReminders() {
  const session = useAppStore.getState?.().session
  const userId = session?.userId
  if (!userId) return                       // super admin has no user row to notify
  const orgId = session?.organizationId || null
  const today = todayStr()

  const { data: tasks, error } = await sb
    .from('tasks')
    .select('id, title, deadline, status, assigned_to, created_by')
    .eq('remind_daily', true)
    .neq('status', 'done')
    .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
  if (error) { console.warn('[dailyReminders] load failed:', error.message); return }

  const open = tasks || []
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
