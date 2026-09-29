// Opens one project's materials on their own page (screen 'projectmaterials')
// IN THE SAME TAB. A separate tab was tried first and dropped: several tabs of
// the same app open at once is how people lose track of what they were doing
// where. "All projects" on that page returns to the workspace, with the
// project it came from open again.
//
// The page is still a real URL (?screen=projectmaterials&project=<id>), so it
// can be reloaded or bookmarked, and the browser's Back button leaves it.
const REOPEN_KEY = 'ictlab_reopen_project'

export function projectMaterialsUrl(projectId, materialId = null) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('screen', 'projectmaterials')
  url.searchParams.set('project', projectId)
  if (materialId) url.searchParams.set('material', materialId)
  return url.toString()
}

export function openProjectMaterials(projectId, setScreen) {
  window.history.pushState({}, '', projectMaterialsUrl(projectId))
  setScreen('projectmaterials')
}

// Back to the Project Workspace, asking it to reopen `projectId`.
export function backToProjects(projectId, setScreen) {
  try { if (projectId) sessionStorage.setItem(REOPEN_KEY, projectId) } catch {}
  const url = new URL(window.location.href)
  url.search = ''
  window.history.pushState({}, '', url)
  setScreen('projects')
}

// Read once by the workspace on mount; cleared so it only happens once.
export function takeReopenProject() {
  try {
    const id = sessionStorage.getItem(REOPEN_KEY)
    sessionStorage.removeItem(REOPEN_KEY)
    return id
  } catch { return null }
}
