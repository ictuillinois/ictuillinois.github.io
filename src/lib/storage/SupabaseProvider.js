import { sb } from '../supabase'

export class SupabaseProvider {
  async upload(bucket, path, file) {
    const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type })
    if (error) throw error
    const { data } = sb.storage.from(bucket).getPublicUrl(path)
    return { url: data.publicUrl, ref: path }
  }

  getUrl(bucket, path) {
    return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl
  }

  async resolveUrl(_ref, bucket, path) {
    return this.getUrl(bucket, path)
  }

  async remove(bucket, path) {
    await sb.storage.from(bucket).remove([path])
  }

  isConnected() { return true }
}
