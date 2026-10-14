import { useEffect, useState } from 'react'
import { sb } from './supabase'

// Sub projects (Oct 2026): an optional level between a project and its
// material folders.
//
//   project → sub project → material folder → reductions
//
// project_subprojects holds a project's sub projects; material_subprojects
// says which of them a TOP-LEVEL folder is in. A folder can be in several, and
// a folder in none is on the main project. Reductions are never linked — they
// follow the folder they came from, wherever it is filed.
// SQL: sub_projects_setup.sql (both databases).

// Printed on the 4×6 label, which has about one spare line on its tallest
// layout — so short, and enforced on the input, on save, and in the database.
export const SUBPROJECT_MAX = 20

// One colour per folder that is in more than one sub project, the same
// wherever that folder appears, so a shared folder reads as one thing.
export const SHARED_COLOURS = [
  { bd: '#d97706', bg: '#fef3c7', ink: '#92400e' },
  { bd: '#0369a1', bg: '#e0f2fe', ink: '#075985' },
  { bd: '#be185d', bg: '#fce7f3', ink: '#9d174d' },
  { bd: '#4d7c0f', bg: '#ecfccb', ink: '#3f6212' },
  { bd: '#7c3aed', bg: '#f3e8ff', ink: '#5b21b6' },
  { bd: '#0f766e', bg: '#ccfbf1', ink: '#115e59' },
]

// A missing table (SQL not run yet) reads as "no sub projects", so the rest
// of the Projects screen keeps working; `missing` lets a caller say why.
export async function loadSubprojects(projectId) {
  if (!projectId) return { subs: [], links: [], missing: false }
  const [s, l] = await Promise.all([
    sb.from('project_subprojects').select('*').eq('project_id', projectId).order('created_at'),
    sb.from('material_subprojects').select('material_id, subproject_id').eq('project_id', projectId),
  ])
  const missing = !!(s.error || l.error)
  return { subs: s.data || [], links: l.data || [], missing, error: s.error || l.error }
}

// material id → [sub project id, …]
export function linkMap(links) {
  const map = {}
  ;(links || []).forEach(l => { (map[l.material_id] ||= []).push(l.subproject_id) })
  return map
}

// material id → colour, for folders in two or more sub projects. `orderedIds`
// fixes the order (the folders as listed), so a colour does not jump around.
export function sharedColours(orderedIds, map) {
  const out = {}
  let i = 0
  orderedIds.forEach(id => { if ((map[id] || []).length > 1) out[id] = SHARED_COLOURS[i++ % SHARED_COLOURS.length] })
  return out
}

// The label line: every sub project's name, or the first and a count when
// they would pass 30 characters, so the line never wraps.
export function subprojectLabelLine(names) {
  const n = (names || []).filter(Boolean)
  if (!n.length) return ''
  const all = n.join(', ')
  return all.length <= 30 ? all : `${n[0]} +${n.length - 1}`
}

// The sub project line for a material's label. A reduction is filed with its
// top-level folder, so walk up to that folder first.
export function useSubprojectLine(material) {
  const [line, setLine] = useState('')
  const id = material?.id
  const parentId = material?.parent_material_id
  useEffect(() => {
    let off = false
    if (!id) { setLine(''); return }
    ;(async () => {
      let rootId = id, up = parentId, guard = 0
      while (up && guard++ < 20) {
        rootId = up
        const { data } = await sb.from('project_materials').select('parent_material_id').eq('id', up).maybeSingle()
        up = data?.parent_material_id || null
      }
      const { data, error } = await sb.from('material_subprojects')
        .select('project_subprojects(name, created_at)').eq('material_id', rootId)
      if (off || error) return
      const names = (data || []).map(r => r.project_subprojects).filter(Boolean)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map(s => s.name)
      setLine(subprojectLabelLine(names))
    })()
    return () => { off = true }
  }, [id, parentId])
  return line
}
