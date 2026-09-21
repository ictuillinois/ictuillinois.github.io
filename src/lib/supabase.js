import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://ilqnwprvxwbhvrjstwsd.supabase.co'
const SUPABASE_KEY = 'sb_publishable_HEl1HIKUs2vVmqa16LZhlQ_EwciS1M8'

// Auth storage adapter — powers the "Keep me signed in" checkbox.
// Login sets ictlab_keep_signed_in BEFORE calling signInWithPassword.
const authStorage = {
  getItem: (k) => localStorage.getItem(k) ?? sessionStorage.getItem(k),
  setItem: (k, v) => {
    if (localStorage.getItem('ictlab_keep_signed_in') === 'false') {
      sessionStorage.setItem(k, v)
      localStorage.removeItem(k)
    } else {
      localStorage.setItem(k, v)
      sessionStorage.removeItem(k)
    }
  },
  removeItem: (k) => { localStorage.removeItem(k); sessionStorage.removeItem(k) },
}

// Surface failed REST calls that call sites forgot to check.
//
// Most write call sites do `await sb.from(t).update(...)` without ever reading
// the returned `error`, so an RLS denial or schema mismatch is completely
// invisible — the code carries on and often shows a success toast for a write
// that never happened. Intercepting at the fetch layer catches every one of
// them centrally, without changing the {data, error} contract any call site
// relies on. Logged, not toasted: call sites that DO handle their error
// already show a message, and a second toast would double up.
function reportRestFailure(method, url, status, body) {
  const table = url.split('/rest/v1/')[1]?.split('?')[0] || 'unknown'
  // Never report failures of the error-logging table itself — logAdminError
  // writes there, so a failure would recurse forever.
  if (table === 'admin_notifications') return
  const detail = `${method} ${table} → ${status} ${String(body).slice(0, 300)}`
  console.error('[supabase]', detail)
  if (method === 'GET') return   // reads degrade to an empty UI, not lost data
  import('./logAdminError')
    .then(({ logAdminError }) => logAdminError(`DB write failed: ${table}`, detail))
    .catch(() => {})
}

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: authStorage },
  global: {
    fetch: async (url, options = {}) => {
      const res = await fetch(url, { ...options, cache: 'no-store' })
      try {
        const u = typeof url === 'string' ? url : (url?.url || '')
        // 401 is normal during token refresh; 406 is maybeSingle() finding no
        // row. Neither is a fault worth reporting.
        if (!res.ok && u.includes('/rest/v1/') && res.status !== 401 && res.status !== 406) {
          const method = (options.method || 'GET').toUpperCase()
          res.clone().text()
            .then(body => reportRestFailure(method, u, res.status, body))
            .catch(() => {})
        }
      } catch { /* never let diagnostics break a request */ }
      return res
    },
  },
})
