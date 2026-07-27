// Filesystem storage not available in ICT-Lab (no mobile/Capacitor)
export class FilesystemProvider {
  get key() { return 'filesystem' }
  get label() { return 'Local Filesystem' }
  async upload() { throw new Error('Filesystem storage not supported') }
  async download() { throw new Error('Filesystem storage not supported') }
  resolveUrl() { return null }
}
