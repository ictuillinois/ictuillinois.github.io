// StorageService — storage routing with three modes per data category
//
// MODES:
//   website_only        — ICT-Lab Cloud only (default, recommended ⭐)
//   website_plus_copy   — ICT-Lab Cloud primary + silent backup to external provider
//   external_only       — external provider only (account basics always stay on ICT-Lab)
//
// CATEGORIES:
//   'a' — Core Platform Data (SOPs, equipment, calibration, bookings, training, messages…)
//   'b' — Activity & Workspace Data (test results, project files, QR, inspection results…)
//
// TEAM USERS:
//   Category A → org admin sets the mode (ictlab_org_storage_mode) + provider (ictlab_org_cloud_copy)
//   Category B → always website_only or website_plus_copy (ICT-Lab always keeps a copy);
//               individual user can add their own secondary (ictlab_team_b_provider)
//
// SOLO USERS:
//   Category A → ictlab_solo_mode_a + ictlab_storage_provider
//   Category B → ictlab_solo_mode_b + ictlab_storage_provider
//   Group workspace → ictlab_group_storage ('website' | provider key)
//
// BACKWARD COMPAT: { personal: false } → category 'a', { personal: true } → category 'b'
//
// Legacy "ext:provider:id" refs in the DB are still resolved via resolveUrl/useStorageUrl.

import { SupabaseProvider } from './SupabaseProvider'
import { FilesystemProvider } from './FilesystemProvider'
import { GoogleDriveProvider } from './GoogleDriveProvider'
import { OneDriveProvider } from './OneDriveProvider'
import { LocalFolderProvider } from './LocalFolderProvider'
import { S3Provider } from './S3Provider'

// ── localStorage keys ──────────────────────────────────────────────────────
export const PROVIDER_KEY      = 'ictlab_storage_provider'    // external provider for solo
export const ORG_MODE_KEY      = 'ictlab_org_storage_mode'    // team org storage mode
export const ORG_COPY_KEY      = 'ictlab_org_cloud_copy'      // team org backup provider
export const TEAM_B_KEY        = 'ictlab_team_b_provider'     // team user secondary for Category B
export const SOLO_MODE_A_KEY   = 'ictlab_solo_mode_a'         // solo Category A mode
export const SOLO_MODE_B_KEY   = 'ictlab_solo_mode_b'         // solo Category B mode
export const GROUP_STORAGE_KEY = 'ictlab_group_storage'       // solo group workspace provider

// ── Mode constants ─────────────────────────────────────────────────────────
export const MODE_WEBSITE_ONLY      = 'website_only'
export const MODE_WEBSITE_PLUS_COPY = 'website_plus_copy'
export const MODE_EXTERNAL_ONLY     = 'external_only'

// ── Provider instances ─────────────────────────────────────────────────────
export const providers = {
  supabase:    new SupabaseProvider(),
  filesystem:  new FilesystemProvider(),
  gdrive:      new GoogleDriveProvider(),
  onedrive:    new OneDriveProvider(),
  localfolder: new LocalFolderProvider(),
  s3:          new S3Provider(),
}

export function getActiveProviderKey() {
  return localStorage.getItem(PROVIDER_KEY) || 'supabase'
}

export function setActiveProviderKey(key) {
  localStorage.setItem(PROVIDER_KEY, key)
}

export function getActiveProvider() {
  return providers[getActiveProviderKey()] || providers.supabase
}

export function isExternalRef(value) {
  return typeof value === 'string' && value.startsWith('ext:')
}

function parseRef(extRef) {
  const parts = extRef.split(':')
  return { providerKey: parts[1], ref: parts.slice(2).join(':') }
}

function getLoginMode() {
  return localStorage.getItem('ictlab_login_mode') || 'team'
}

// ── Strategy resolvers ─────────────────────────────────────────────────────

function teamStrategy(category) {
  const orgMode = localStorage.getItem(ORG_MODE_KEY) || MODE_WEBSITE_ONLY
  const orgProvider = localStorage.getItem(ORG_COPY_KEY) || null

  if (category === 'a') {
    return { mode: orgMode, providerKey: orgProvider }
  }

  // Category B for team: ICT-Lab always keeps a copy — no external_only
  if (orgMode === MODE_EXTERNAL_ONLY) {
    // Org went external-only; B follows org provider as backup, website primary
    return { mode: MODE_WEBSITE_PLUS_COPY, providerKey: orgProvider }
  }
  const userSecondary = localStorage.getItem(TEAM_B_KEY) || null
  if (userSecondary) return { mode: MODE_WEBSITE_PLUS_COPY, providerKey: userSecondary }
  return { mode: MODE_WEBSITE_ONLY, providerKey: null }
}

function soloStrategy(category) {
  const modeKey = category === 'a' ? SOLO_MODE_A_KEY : SOLO_MODE_B_KEY
  const mode = localStorage.getItem(modeKey) || MODE_WEBSITE_ONLY
  const providerKey = getActiveProviderKey()
  return { mode, providerKey: providerKey !== 'supabase' ? providerKey : null }
}

function groupStrategy() {
  const gp = localStorage.getItem(GROUP_STORAGE_KEY) || 'website'
  if (gp === 'website') return { mode: MODE_WEBSITE_ONLY, providerKey: null }
  return { mode: MODE_EXTERNAL_ONLY, providerKey: gp }
}

// ── Core upload executor ───────────────────────────────────────────────────

async function executeUpload(bucket, path, file, mode, providerKey) {
  const hasProvider = providerKey && providers[providerKey]

  if (mode === MODE_EXTERNAL_ONLY && hasProvider) {
    return providers[providerKey].upload(bucket, path, file)
  }

  if (mode === MODE_WEBSITE_PLUS_COPY) {
    const result = await providers.supabase.upload(bucket, path, file)
    if (hasProvider) {
      providers[providerKey].upload(bucket, path, file).catch(e =>
        console.warn(`[StorageService] Backup copy to ${providerKey} failed:`, e)
      )
    }
    return result
  }

  // website_only (or external_only fallback when no provider configured)
  return providers.supabase.upload(bucket, path, file)
}

// ── Public API ─────────────────────────────────────────────────────────────

const StorageService = {
  // Upload a file.
  // Options:
  //   category: 'a' | 'b'  — which data category (defaults to 'b')
  //   isGroup: boolean      — group workspace data (solo only)
  //   personal: boolean     — legacy: false→'a', true→'b'
  async upload(bucket, path, file, { personal, category, isGroup = false } = {}) {
    if (category === undefined) {
      category = (personal === false) ? 'a' : 'b'
    }

    const loginMode = getLoginMode()
    let strategy

    if (isGroup) {
      strategy = groupStrategy()
    } else if (loginMode === 'solo') {
      strategy = soloStrategy(category)
    } else {
      strategy = teamStrategy(category)
    }

    return executeUpload(bucket, path, file, strategy.mode, strategy.providerKey)
  },

  // Resolve a stored value (plain URL or legacy ext: ref) to a usable URL.
  async resolveUrl(stored) {
    if (!stored) return null
    if (!isExternalRef(stored)) return stored
    const { providerKey, ref } = parseRef(stored)
    const provider = providers[providerKey]
    if (!provider) return null
    return provider.resolveUrl(`ext:${providerKey}:${ref}`)
  },

  // Remove a file by its stored value (URL or ext: ref).
  async remove(bucket, stored) {
    if (!stored) return
    if (!isExternalRef(stored)) return providers.supabase.remove(bucket, stored)
    const { providerKey, ref } = parseRef(stored)
    const provider = providers[providerKey]
    if (provider) await provider.remove(bucket, `ext:${providerKey}:${ref}`)
  },

  isConnected() { return getActiveProvider().isConnected() },
}

export default StorageService

// ── React hook ─────────────────────────────────────────────────────────────
// Resolves a stored value (URL or ext: ref) for use in <img> / <a>.
import { useState, useEffect } from 'react'
export function useStorageUrl(stored) {
  const [resolved, setResolved] = useState(() => isExternalRef(stored) ? null : stored)
  useEffect(() => {
    if (!stored) { setResolved(null); return }
    if (!isExternalRef(stored)) { setResolved(stored); return }
    let cancelled = false
    StorageService.resolveUrl(stored).then(url => { if (!cancelled) setResolved(url) })
    return () => { cancelled = true }
  }, [stored])
  return resolved
}
