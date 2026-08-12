import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { StudentsPanel, StaffPanel, ApprovalRequestsPanel } from '../profile/Profile'
import { sb } from '../../lib/supabase'

const TAB_TITLES = {
  students:  'Lab Users',
  staff:     'Lab Managers',
  approvals: 'Approval Requests',
  guide:     'Lab Manager Guide',
}

function LabManagerGuidePanel() {
  const PDF_URL = '/lab-manager-guide.pdf'
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text1)' }}>Lab Manager Guide</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>ICT-Lab Platform — Version 2.0, August 2026</div>
        </div>
        <a href={PDF_URL} download="ICT-Lab-Manager-Guide.pdf"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--accent)', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
          ⬇ Download PDF
        </a>
      </div>
      <iframe
        src={PDF_URL}
        title="Lab Manager Guide"
        style={{ width: '100%', height: 'calc(100vh - 260px)', minHeight: 500, border: '1px solid var(--border)', borderRadius: 8, display: 'block' }}
      />
    </div>
  )
}

export default function LabManagement() {
  const { session, toast, sidebarSubTab } = useAppStore()
  const [pendingCount, setPendingCount] = useState(0)

  // Tabs live in the sidebar (Layout getScreenTabs 'labmanagement')
  const tab = ['students', 'staff', 'approvals', 'guide'].includes(sidebarSubTab) ? sidebarSubTab : 'students'

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
      {tab === 'guide'     && <LabManagerGuidePanel />}
    </div>
  )
}
