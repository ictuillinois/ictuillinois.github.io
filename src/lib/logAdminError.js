import { sb } from './supabase'

export async function logAdminError(title, body) {
  try {
    await sb.from('admin_notifications').insert({ type: 'app_error', title, body, read: false })
  } catch (_) {}
}
