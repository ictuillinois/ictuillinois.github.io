// Opens one project's materials on their own page (screen 'projectmaterials').
//
// Web: a separate browser tab, at most ONE per project — the window name makes
// a second click bring back the tab already open instead of stacking another.
// The Project Workspace tab stays exactly as it was.
//
// Native app (Capacitor): there are no browser tabs, and window.open would
// leave the app for the system browser, so it navigates in place instead.
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
  const url = projectMaterialsUrl(projectId)
  if (window.Capacitor?.isNativePlatform?.()) {
    window.history.pushState({}, '', url)
    setScreen('projectmaterials')
    return
  }
  window.open(url, `project-materials-${projectId}`)
}
