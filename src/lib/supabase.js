import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ilqnwprvxwbhvrjstwsd.supabase.co'
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

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: authStorage },
  global: {
    fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
  },
})
