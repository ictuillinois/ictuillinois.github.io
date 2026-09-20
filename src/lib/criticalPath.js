// Critical path for a set of tasks and their dependencies.
//
// Pure functions on plain data — no Supabase, no React — so the graph maths
// can be reasoned about and tested on its own. Everything here tolerates a
// broken graph: dangling edges, cycles, tasks with no dates. A planning view
// that throws is worse than one that says "these tasks form a loop".

const DAY = 86400000
const parse = s => (s ? new Date(`${s}T00:00:00`) : null)

// Working length of a task, in days, minimum 1. A task with one date or no
// dates still occupies a day — treating it as zero-length lets it collapse
// into its neighbours and silently join the critical path.
export function durationDays(t) {
  const s = parse(t.start_date), e = parse(t.deadline)
  if (s && e) return Math.max(1, Math.round((e - s) / DAY) + 1)
  return 1
}

// What is LEFT of a task. A done task has no remaining work, so it cannot
// delay anything that waits on it and it cannot slip the finish date — its
// remaining length is 0 even though its planned length is unchanged.
// durationDays stays the PLANNED length, which is what the boxes display.
export function remainingDays(t) {
  return t?.status === 'done' ? 0 : durationDays(t)
}

// Kahn's algorithm. Returns the order plus whatever could not be ordered,
// which is exactly the set of tasks caught in a cycle.
export function topoOrder(tasks, edges) {
  const ids = new Set(tasks.map(t => t.id))
  const preds = new Map([...ids].map(id => [id, []]))
  const succs = new Map([...ids].map(id => [id, []]))
  edges.forEach(e => {
    // Drop edges pointing outside the set rather than crashing on them: the
    // view is often filtered to one project while a dependency reaches out.
    if (!ids.has(e.task_id) || !ids.has(e.depends_on_id)) return
    preds.get(e.task_id).push(e.depends_on_id)
    succs.get(e.depends_on_id).push(e.task_id)
  })

  const indeg = new Map([...ids].map(id => [id, preds.get(id).length]))
  const queue = [...ids].filter(id => indeg.get(id) === 0)
  const order = []
  while (queue.length) {
    const id = queue.shift()
    order.push(id)
    succs.get(id).forEach(s => {
      indeg.set(s, indeg.get(s) - 1)
      if (indeg.get(s) === 0) queue.push(s)
    })
  }
  const cyclic = [...ids].filter(id => !order.includes(id))
  return { order, preds, succs, cyclic }
}

// Forward and backward pass. Slack 0 means the task cannot slip without
// moving the whole finish date — that is the critical path.
export function criticalPath(tasks, edges) {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const { order, preds, succs, cyclic } = topoOrder(tasks, edges)
  const dur = id => remainingDays(byId.get(id))

  const es = new Map(), ef = new Map()
  order.forEach(id => {
    const start = preds.get(id).reduce((m, p) => Math.max(m, ef.get(p) ?? 0), 0)
    es.set(id, start)
    ef.set(id, start + dur(id))
  })
  const finish = order.reduce((m, id) => Math.max(m, ef.get(id) ?? 0), 0)

  const lf = new Map(), ls = new Map()
  ;[...order].reverse().forEach(id => {
    const end = succs.get(id).length
      ? succs.get(id).reduce((m, s) => Math.min(m, ls.get(s) ?? finish), Infinity)
      : finish
    lf.set(id, end)
    ls.set(id, end - dur(id))
  })

  const slack = new Map()
  const critical = new Set()
  order.forEach(id => {
    const s = (ls.get(id) ?? 0) - (es.get(id) ?? 0)
    slack.set(id, s)
    // A done task can land on slack 0 — it sits at the head of a critical
    // chain with zero remaining length — but calling finished work "critical"
    // is wrong: there is nothing left to slip. Never mark it.
    if (s === 0 && byId.get(id)?.status !== 'done') critical.add(id)
  })

  // A cycle has no meaningful slack, so those tasks are reported rather than
  // given a made-up number.
  return { critical, slack, finishDays: finish, cyclic, preds, succs }
}

// Would adding task -> dependsOn close a loop? Walk up from dependsOn and see
// whether we can reach task. Checked before the insert, because a cycle makes
// the whole chart meaningless and is tedious to unpick afterwards.
export function wouldCycle(edges, taskId, dependsOnId) {
  if (taskId === dependsOnId) return true
  const preds = new Map()
  edges.forEach(e => {
    if (!preds.has(e.task_id)) preds.set(e.task_id, [])
    preds.get(e.task_id).push(e.depends_on_id)
  })
  const seen = new Set()
  const stack = [dependsOnId]
  while (stack.length) {
    const id = stack.pop()
    if (id === taskId) return true
    if (seen.has(id)) continue
    seen.add(id)
    ;(preds.get(id) || []).forEach(p => stack.push(p))
  }
  return false
}
