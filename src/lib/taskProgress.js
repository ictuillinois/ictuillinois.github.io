import { sb } from './supabase'
import { useAppStore } from '../store/useAppStore'

// Every change to a task's progress or status, in one place.
//
// `tasks.progress` holds only the CURRENT value, so no chart of the past can
// be drawn from it — the history has to be written as it happens or it does
// not exist. Three call sites updated progress independently before this; a
// fourth would have quietly gone unlogged and left a hole in every chart.
//
// The session is read from the store rather than passed in. Two of the three
// callers (TaskModal, Meetings) have neither a session nor an orgId prop, and
// referencing an undeclared one there is a ReferenceError that a build does
// not catch — it would crash the task board the first time someone ticked a
// task off.
function actor() {
  const s = useAppStore.getState?.().session || {}
  return { userId: s.userId || null, orgId: s.organizationId || null }
}

// Best-effort: failing to record history must never block the user's edit.
async function logPoint(taskId, progress, status) {
  const { userId, orgId } = actor()
  const { error } = await sb.from('task_progress_log').insert({
    task_id: taskId,
    progress: Math.max(0, Math.min(100, progress ?? 0)),
    status: status || null,
    changed_by: userId,
    organization_id: orgId,
  })
  if (error) console.warn('[taskProgress] history not recorded:', error.message)
}

export async function setTaskProgress(task, progress) {
  const { error } = await sb.from('tasks').update({ progress }).eq('id', task.id)
  if (error) { console.error('[taskProgress] update failed:', error); return { error } }
  await logPoint(task.id, progress, task.status)
  return { error: null }
}

export async function setTaskStatus(task, status) {
  // Reaching 'done' means 100%: leaving a task done at 40% makes every chart
  // that reads progress under-report finished work.
  const progress = status === 'done' ? 100 : (task.progress ?? 0)
  const patch = status === 'done' ? { status, progress } : { status }
  const { error } = await sb.from('tasks').update(patch).eq('id', task.id)
  if (error) { console.error('[taskProgress] update failed:', error); return { error } }
  await logPoint(task.id, progress, status)
  return { error: null, progress }
}

// Deleting a task must take its dependency edges with it. `task_dependencies`
// has no foreign key to `tasks`, so an orphan edge survives the delete and
// keeps being counted — that is how the Timeline came to announce a critical
// path while the diagram below it said there were no dependencies at all.
// Attachments are left alone: they are files in storage, not graph state.
export async function deleteTask(id) {
  const { error } = await sb.from('tasks').delete().eq('id', id)
  if (error) { console.error('[taskProgress] delete failed:', error); return { error } }
  const [dep, log] = await Promise.all([
    sb.from('task_dependencies').delete().or(`task_id.eq.${id},depends_on_id.eq.${id}`),
    sb.from('task_progress_log').delete().eq('task_id', id),
  ])
  if (dep.error) console.warn('[taskProgress] dependency cleanup failed:', dep.error.message)
  if (log.error) console.warn('[taskProgress] history cleanup failed:', log.error.message)
  return { error: null }
}
