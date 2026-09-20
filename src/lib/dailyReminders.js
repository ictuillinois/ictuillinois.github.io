import { sb } from './supabase'
import { useAppStore } from '../store/useAppStore'
import { sendTaskNotification } from './notify'

// Daily task reminders.
//
// The "Remind me daily" tick box on a task wrote tasks.remind_daily and then
// nothing read it except a list on the Reminders tab — no notification was
// ever sent for it, so the box promised something the app did not do.
//
// Runs app-wide on login rather than from the Reminders tab's mount effect,
// which is where the rest of the reminder checks still live. A reminder you
// only receive by visiting the reminder page is not a reminder.
//
// Honest limitation: this is still the browser, so "daily" means the first
// time you open the app that day, not 7am sharp. Delivering it while the app
// is closed needs a scheduled job on Supabase, not client code.

const KEY = uid => `ictlab_daily_task_check_${uid}`
const todayStr = () => {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

export async function runDailyTaskReminders() {
  const session = useAppStore.getState?.().session
  const userId = session?.userId
  if (!userId) return                    // super admin has no user row to notify

  const today = todayStr()
  try { if (localStorage.getItem(KEY(userId)) === today) return } catch { /* private mode */ }

  // Written BEFORE sending. A failed send is better than a notification loop
  // that fires on every navigation because the marker never got stored.
  try { localStorage.setItem(KEY(userId), today) } catch { /* ignore */ }

  const { data: tasks, error } = await sb
    .from('tasks')
    .select('id, title, deadline, remind_daily, status, assigned_to, created_by')
    .eq('remind_daily', true)
    .neq('status', 'done')
    .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
  if (error) { console.warn('[dailyReminders] load failed:', error.message); return }

  const open = tasks || []
  if (open.length) {
    const overdue = open.filter(t => t.deadline && t.deadline < today)
    const dueToday = open.filter(t => t.deadline === today)
    const bits = []
    if (dueToday.length) bits.push(`${dueToday.length} due today`)
    if (overdue.length) bits.push(`${overdue.length} overdue`)
    const title = open.length === 1 ? `Daily reminder: ${open[0].title}` : `Daily reminder: ${open.length} tasks`
    const body = (bits.length ? bits.join(' · ') + ' — ' : '')
      + open.slice(0, 4).map(t => t.title).join(', ')
      + (open.length > 4 ? `, +${open.length - 4} more` : '')
    await sendTaskNotification(userId, 'reminder_daily', title, body, open.length === 1 ? open[0].id : null)
  }

  // "Due tomorrow" used to fire only from the My Tasks list, so you got it
  // only on days you happened to open that one tab. Same check, run here.
  const t = new Date(); t.setDate(t.getDate() + 1)
  const tomorrow = [t.getFullYear(), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0')].join('-')
  const { data: soon } = await sb
    .from('tasks')
    .select('id, title')
    .eq('deadline', tomorrow)
    .neq('status', 'done')
    .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
  for (const task of soon || []) {
    await sendTaskNotification(userId, 'deadline_reminder', '⏰ Task due tomorrow', `"${task.title}" is due tomorrow`, task.id)
  }
}
