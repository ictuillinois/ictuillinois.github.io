import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { StudentsPanel, StaffPanel, ApprovalRequestsPanel } from '../profile/Profile'
import { sb } from '../../lib/supabase'

const TAB_TITLES = {
  students:  'Lab Users',
  staff:     'Lab Managers',
  approvals: 'Approval Requests',
}

export default function LabManagement() {
  const { session, toast, sidebarSubTab } = useAppStore()
  const [pendingCount, setPendingCount] = useState(0)

  // Tabs live in the sidebar (Layout getScreenTabs 'labmanagement')
  const tab = ['students', 'staff', 'approvals'].includes(sidebarSubTab) ? sidebarSubTab : 'students'

  useEffect(() => { loadPendingCount() }, [])

  async function loadPendingCount() {
    if (!session?.organizationId) return
    const { count } = await sb.from('account_deletion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', session.organizationId)
      .eq('status', 'pending')
    setPendingCount(count || 0)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="section-title">Lab Management — {TAB_TITLES[tab] || 'Lab Users'}</div>
        {pendingCount > 0 && tab !== 'approvals' && (
          <span style={{ fontSize: 12, fontWeight: 700, background: '#fef3c7', color: '#b91c1c', border: '1px solid #f59e0b', borderRadius: 99, padding: '2px 10px' }}>
            📋 {pendingCount} pending approval{pendingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {tab === 'students'  && <StudentsPanel toast={toast} session={session} />}
      {tab === 'staff'     && <StaffPanel    toast={toast} session={session} />}
      {tab === 'approvals' && <ApprovalRequestsPanel toast={toast} session={session} onCountChange={setPendingCount} />}
    </div>
  )
}
