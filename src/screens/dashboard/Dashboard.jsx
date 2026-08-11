import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import { ALL_MODULES_META, PINNED_MODULES, STAFF_PINNED_MODULES } from '../../components/DashboardIconPicker'

function getModules(role, loginMode, activeModules) {
  const roleKey = loginMode === 'solo' ? 'solo' : 'team'
  const isStaff = role === 'admin' || role === 'user'
  const studentAllowed = ['projects', 'booking', 'mileage', 'barcode', 'training', 'profile']
  const base = ALL_MODULES_META.filter(m => {
    if (!m.roles.includes(roleKey)) return false
    if (role === 'lab_user' && !studentAllowed.includes(m.key)) return false
    if (m.adminOnly && !isStaff) return false
    if (m.hideForStaff && isStaff) return false
    if (m.staffOnly && !isStaff) return false
    if (m.soloLocked && loginMode === 'solo') return false
    return true
  })
  if (activeModules !== null && activeModules !== undefined) {
    const baseMap = Object.fromEntries(base.map(m => [m.key, m]))
    const ordered = []
    activeModules.forEach(k => { if (baseMap[k]) ordered.push(baseMap[k]) })
    PINNED_MODULES.forEach(k => { if (baseMap[k] && !activeModules.includes(k)) ordered.push(baseMap[k]) })
    if (isStaff) STAFF_PINNED_MODULES.forEach(k => { if (baseMap[k] && !activeModules.includes(k)) ordered.push(baseMap[k]) })
    if (role === 'admin') base.forEach(m => { if (m.adminOnly && !activeModules.includes(m.key)) ordered.push(m) })
    if (isStaff) base.forEach(m => { if (m.studentLocked && !activeModules.includes(m.key)) ordered.push(m) })
    if (isStaff) base.forEach(m => { if (m.staffOnly && !activeModules.includes(m.key)) ordered.push(m) })
    return ordered
  }
  return base
}

function getAllModulesForStudent() {
  return [
    { key: 'projects',   screen: 'projects',   label: 'Project Workspace', sub: 'Inventory, results & workspace',   icon: '🧪', bg: '#EEEDFE', color: '#534AB7' },
    { key: 'booking',    screen: 'booking',    label: 'Reserve Equipment', sub: 'Reserve lab equipment',            icon: '📅', bg: '#e0f2fe', color: '#0369a1' },
    { key: 'barcode',    screen: 'barcode',    label: 'QR Scan',           sub: 'Scan & look up lab materials',     icon: '📷', bg: '#e0f7fa', color: '#00796b' },
    { key: 'training',   screen: 'training',   label: 'Training Records',  sub: 'Safety steps & certifications',    icon: '🎓', bg: '#e0f2fe', color: '#0369a1' },
    { key: 'mileage',    screen: null,         label: 'Mileage Form',      sub: 'Submit mileage reimbursement',     icon: '🚗', bg: '#fdf0ed', color: '#c84b2f', external: true },
    { key: 'barcodeqr',  screen: 'barcodeqr',  label: 'QR Labels',         sub: 'Equipment QR code management',     icon: '🔲', bg: '#f0f4ff', color: '#1a56db', locked: true },
    { key: 'profile',    screen: 'profile',    label: 'Profile',           sub: 'Your info & settings',             icon: '👤', bg: '#EEEDFE', color: '#534AB7' },
  ]
}

function ExternalLinkModal({ url, onConfirm, onCancel }) {
  const hasUrl = url && url.trim() && url.startsWith('http')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 380, width: '100%', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>{hasUrl ? '🔗' : '⚠️'}</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, textAlign: 'center' }}>{hasUrl ? 'Leaving InteleLab' : 'Link not configured'}</div>
        {hasUrl ? (
          <>
            <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 8, textAlign: 'center' }}>You are being redirected to an external website:</div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 14px', marginBottom: 20, fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--mono)', wordBreak: 'break-all', textAlign: 'center' }}>{url}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={onConfirm}>Continue →</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 20, textAlign: 'center' }}>The admin has not set up a URL for this link yet. Please contact your lab manager.</div>
            <button className="btn" style={{ width: '100%' }} onClick={onCancel}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}

function ModuleCard({ m, onClick, imgUrl, isAdminManage, onDragStart, onDragOver, onDrop, onDragEnd, isDragging, isDragOver }) {
  const draggable = !!onDragStart
  return (
    <a
      href="#"
      className="module-card-link"
      draggable={draggable}
      onClick={e => { e.preventDefault(); onClick?.() }}
      onTouchEnd={e => { e.preventDefault(); onClick?.() }}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', m.key); e.dataTransfer.setDragImage(e.currentTarget, e.offsetX, e.offsetY); onDragStart?.() }}
      onDragOver={e => { e.preventDefault(); onDragOver?.() }}
      onDrop={e => { e.preventDefault(); onDrop?.() }}
      onDragEnd={() => onDragEnd?.()}
      style={{
        display: 'block',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        cursor: draggable ? 'grab' : 'pointer',
        border: isDragOver ? '2px solid var(--accent)' : isAdminManage ? '1px dashed var(--border)' : '1px solid var(--border)',
        position: 'relative',
        backgroundColor: m.bg,
        backgroundImage: imgUrl ? `url(${imgUrl})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        WebkitUserSelect: 'none',
        textDecoration: 'none',
        opacity: isDragging ? 0.35 : 1,
        transition: 'opacity 0.15s, border-color 0.15s',
      }}>
      <div style={{ position: 'absolute', inset: 0, background: imgUrl ? 'linear-gradient(to top, rgba(0,0,0,0.85) 35%, rgba(0,0,0,0.15) 100%)' : 'linear-gradient(to top, rgba(0,0,0,0.15) 0%, transparent 100%)', pointerEvents: 'none' }} />
      {m.external && <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 10, borderRadius: 4, padding: '2px 6px', pointerEvents: 'none' }}>↗ External</div>}
      {isAdminManage && <div style={{ position: 'absolute', top: 10, right: 10, background: m.color, color: '#fff', fontSize: 10, borderRadius: 4, padding: '2px 8px', fontWeight: 600, pointerEvents: 'none' }}>⚙ Edit</div>}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 14px', pointerEvents: 'none' }}>
        {!imgUrl && <div style={{ fontSize: 28, marginBottom: 6 }}>{m.icon}</div>}
        <div style={{ fontWeight: 700, fontSize: 14, color: imgUrl ? '#fff' : m.color, textShadow: imgUrl ? '0 2px 6px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8)' : 'none', marginBottom: 2 }}>{m.label}</div>
        <div style={{ fontSize: 11, color: imgUrl ? 'rgba(255,255,255,0.9)' : m.color, opacity: imgUrl ? 1 : 0.75, textShadow: imgUrl ? '0 1px 4px rgba(0,0,0,0.8)' : 'none' }}>{isAdminManage ? 'Click to manage link' : m.sub}</div>
      </div>
    </a>
  )
}

function LockedCard({ m, message = '🔒 Lab managers only' }) {
  return (
    <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative', cursor: 'not-allowed' }}>
      <div style={{ position: 'absolute', inset: 0, background: m.bg, filter: 'blur(2px)', opacity: 0.5, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, pointerEvents: 'none' }}>
        <div style={{ fontSize: 22, filter: 'grayscale(1)', opacity: 0.4 }}>{m.icon}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#888' }}>{m.label}</div>
        <div style={{ fontSize: 10, color: '#aaa' }}>{message}</div>
      </div>
    </div>
  )
}

const CARD_MAX_H = 152
const GRID_GAP = 14
const APPROX_COLS = 4
function gridMaxHeight(count) {
  const rows = Math.max(1, Math.ceil(count / APPROX_COLS))
  return rows * CARD_MAX_H + (rows - 1) * GRID_GAP
}

function CardGridView({ modules, onNavigate, mileageUrl, labSafetyUrl, isAdmin, onEditUrl, moduleImages, isStudent, activeModules, studentAccess, studentAllowedPool, customLinks = [], onReorder }) {
  const [confirmExternal, setConfirmExternal] = useState(null)
  const [dragSrc, setDragSrc] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  if (isStudent) {
    const allMods = getAllModulesForStudent()
    // Restrict to lab manager's per-user assignment first (allowed_modules, level #3)
    const assignedMods = (studentAllowedPool && studentAllowedPool.size > 0)
      ? allMods.filter(m => studentAllowedPool.has(m.key))
      : allMods
    // Then apply student's personal visibility toggle (active_modules, level #4)
    const visibleMods = activeModules === null || activeModules === undefined
      ? assignedMods
      : assignedMods.filter(m => activeModules.includes(m.key))
    return (
      <>
        <div className="module-icon-grid" style={{ height: '100%', maxHeight: gridMaxHeight(visibleMods.length) }}>
          {visibleMods.map(m => {
            const grantedByAdmin = m.locked && ((m.screen && studentAccess?.has(m.screen)) || studentAllowedPool?.has(m.key))
            if (m.locked && !grantedByAdmin) return null
            return <ModuleCard key={m.key} m={m} imgUrl={moduleImages[m.key]} onClick={() => m.external ? setConfirmExternal({ url: m.key === 'mileage' ? mileageUrl : labSafetyUrl }) : onNavigate(m.screen)} />
          })}
        </div>
        {confirmExternal && <ExternalLinkModal url={confirmExternal.url} onConfirm={() => { window.open(confirmExternal.url, '_blank'); setConfirmExternal(null) }} onCancel={() => setConfirmExternal(null)} />}
      </>
    )
  }

  const adminManageCards = [
    { key: 'mileage', icon: '🚗', label: 'Mileage Form', sub: 'Manage link', bg: '#fdf0ed', color: '#c84b2f', screen: null },
  ].filter(card => !activeModules || activeModules.includes(card.key))

  const visibleModules = isAdmin ? modules.filter(m => !m.external) : modules
  const totalCards = visibleModules.length + (isAdmin ? adminManageCards.length : 0) + customLinks.length

  function handleDrop(targetIdx) {
    if (dragSrc === null || dragSrc === targetIdx) { setDragSrc(null); setDragOver(null); return }
    const reordered = [...visibleModules]
    const [moved] = reordered.splice(dragSrc, 1)
    reordered.splice(targetIdx, 0, moved)
    setDragSrc(null)
    setDragOver(null)
    onReorder?.(reordered.map(m => m.key))
  }

  return (
    <>
      <div className="module-icon-grid" style={{ height: '100%', maxHeight: gridMaxHeight(totalCards) }}>
        {visibleModules.map((m, idx) => (
          <ModuleCard key={m.key} m={m} imgUrl={moduleImages[m.key]}
            onClick={() => m.external ? setConfirmExternal({ url: m.key === 'mileage' ? mileageUrl : labSafetyUrl }) : onNavigate(m.screen)}
            onDragStart={() => setDragSrc(idx)}
            onDragOver={() => setDragOver(idx)}
            onDrop={() => handleDrop(idx)}
            onDragEnd={() => { setDragSrc(null); setDragOver(null) }}
            isDragging={dragSrc === idx}
            isDragOver={dragOver === idx && dragSrc !== idx}
          />
        ))}
        {isAdmin && adminManageCards.map(card => <ModuleCard key={card.key} m={card} imgUrl={moduleImages[card.key]} isAdminManage onClick={() => onEditUrl(card.key)} />)}
        {customLinks.map(link => (
          <ModuleCard key={link.id}
            m={{ key: link.id, label: link.label, sub: '↗ External link', icon: '🔗', bg: '#f0f9ff', color: '#0369a1', external: true }}
            imgUrl={link.image_url || null}
            onClick={() => setConfirmExternal({ url: link.url })} />
        ))}
      </div>
      {confirmExternal && <ExternalLinkModal url={confirmExternal.url} onConfirm={() => { window.open(confirmExternal.url, '_blank'); setConfirmExternal(null) }} onCancel={() => setConfirmExternal(null)} />}
    </>
  )
}

function StudentDashboardView({ session, onNavigate, mileageUrl, moduleImages, activeModules, studentAllowedPool }) {
  const [data, setData] = useState({ myProjects: 0, trainingsComplete: 0, trainingsTotal: 4, upcomingBookings: [], pendingCert: false })
  const [loading, setLoading] = useState(true)
  const [confirmExternal, setConfirmExternal] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  useEffect(() => { if (session?.userId) loadStudentData() }, [session?.userId])
  async function loadStudentData() {
    setLoading(true)
    try {
      const userId = session.userId; const userName = session.username
      let projQ = sb.from('projects').select('id,title,status').or(`students.cs.{"${userName}"},students.ilike.%${userName}%`).eq('status','active')
      if (session?.organizationId) projQ = projQ.eq('organization_id', session.organizationId)
      const { data: projects } = await projQ
      const [freshRes,golfRes,alarmRes,eqRes,pendingRes,bookingsRes] = await Promise.all([
        sb.from('training_fresh').select('id,admin_approved').eq('user_id',userId).maybeSingle(),
        sb.from('training_golf_car').select('id').eq('user_id',userId).maybeSingle(),
        sb.from('training_building_alarm').select('id').eq('user_id',userId).maybeSingle(),
        sb.from('training_equipment').select('id').eq('user_id',userId).limit(1),
        sb.from('training_fresh').select('id').eq('user_id',userId).eq('admin_approved',false).maybeSingle(),
        sb.from('equipment_bookings').select('id,equipment_name,start_time,end_time,status').eq('user_id',userId).gte('start_time',new Date().toISOString()).order('start_time').limit(3),
      ])
      let done = 0
      if (freshRes.data?.admin_approved) done++
      if (golfRes.data) done++
      if (alarmRes.data) done++
      if (eqRes.data?.length) done++
      setData({ myProjects: projects?.length||0, trainingsComplete: done, trainingsTotal: 4, upcomingBookings: bookingsRes.data||[], pendingCert: !!pendingRes.data })
    } catch(e) {}
    setLoading(false)
  }
  const trainingPct = Math.round((data.trainingsComplete/data.trainingsTotal)*100)
  const trainingColor = trainingPct===100?'#1D9E75':trainingPct>=50?'#0369a1':'#c84b2f'
  const allQuickLinks = [
    { key:'projects',   icon:'🧪', label:'Project Workspace', sub:'Inventory, results & workspace', screen:'projects',   color:'#534AB7' },
    { key:'booking',    icon:'📅', label:'Book Equipment',    sub:'Reserve lab equipment',          screen:'booking',    color:'#0369a1' },
    { key:'barcode',    icon:'📷', label:'QR Scan',            sub:'Scan lab materials',             screen:'barcode',    color:'#00796b' },
    { key:'training',   icon:'🎓', label:'Training Records',  sub:'Safety steps & certifications',  screen:'training',   color:'#0369a1' },
    { key:'mileage',    icon:'🚗', label:'Mileage Form',      sub:'Submit reimbursement',           screen:null,         color:'#c84b2f', external:true },
  ]
  const assignedQuickLinks = (studentAllowedPool && studentAllowedPool.size > 0)
    ? allQuickLinks.filter(m => studentAllowedPool.has(m.key))
    : allQuickLinks
  const quickLinks = activeModules === null || activeModules === undefined
    ? assignedQuickLinks
    : assignedQuickLinks.filter(m => activeModules.includes(m.key))
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 260px', gap:20, alignItems:'start' }}>
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
            {[{label:'My active projects',val:data.myProjects,color:'#534AB7',screen:'projects'},{label:'Trainings complete',val:`${data.trainingsComplete}/${data.trainingsTotal}`,color:trainingColor,screen:'training'},{label:'Upcoming bookings',val:data.upcomingBookings.length,color:'#0369a1',screen:'booking'},{label:data.pendingCert?'Cert pending approval':'Cert up to date',val:loading?'—':data.pendingCert?'⏳':'✅',color:data.pendingCert?'#c84b2f':'#1D9E75',screen:'training'}]
              .map((s,i) => (
                <a key={i} href="#" onClick={e=>{e.preventDefault();onNavigate(s.screen)}} onTouchEnd={e=>{e.preventDefault();onNavigate(s.screen)}} style={{ display:'block', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'16px 20px', cursor:'pointer', transition:'all 0.15s', touchAction:'manipulation', WebkitTapHighlightColor:'transparent', textDecoration:'none' }} onMouseEnter={e=>e.currentTarget.style.borderColor=s.color} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                  <div style={{ fontSize:28, fontWeight:600, color:s.color, marginBottom:4 }}>{loading?'—':s.val}</div>
                  <div style={{ fontSize:13, color:'var(--text2)' }}>{s.label}</div>
                </a>
              ))
            }
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ fontSize:12, fontWeight:500, color:'var(--text3)', fontFamily:'var(--mono)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Quick access</div>
          {quickLinks.map(m => (
            <a key={m.key} href="#" onClick={e=>{e.preventDefault();m.external?setConfirmExternal({url:mileageUrl}):onNavigate(m.screen)}} onTouchEnd={e=>{e.preventDefault();m.external?setConfirmExternal({url:mileageUrl}):onNavigate(m.screen)}}
              style={{ display:'block', borderRadius:'var(--radius-lg)', overflow:'hidden', cursor:'pointer', height:56, position:'relative', border:'1px solid var(--border)', transition:'all 0.15s', touchAction:'manipulation', WebkitTapHighlightColor:'transparent', textDecoration:'none', backgroundColor:`${m.color}18`, backgroundImage:moduleImages[m.key]?`url(${moduleImages[m.key]})`:'none', backgroundSize:'cover', backgroundPosition:'center', backgroundRepeat:'no-repeat' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor=m.color} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
              {moduleImages[m.key] && <div style={{ position:'absolute',inset:0,background:'linear-gradient(to right,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.2) 100%)',pointerEvents:'none' }} />}
              <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',gap:12,padding:'0 14px',pointerEvents:'none' }}>
                <span style={{ fontSize:18,flexShrink:0 }}>{m.icon}</span>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:13,fontWeight:600,color:moduleImages[m.key]?'#fff':'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.label}</div>
                  <div style={{ fontSize:10,color:moduleImages[m.key]?'rgba(255,255,255,0.75)':'var(--text3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.sub}</div>
                </div>
                {m.external&&<span style={{ fontSize:10,color:'var(--text3)',flexShrink:0 }}>↗</span>}
              </div>
            </a>
          ))}
        </div>
      </div>
      {confirmExternal&&<ExternalLinkModal url={confirmExternal.url} onConfirm={()=>{window.open(confirmExternal.url,'_blank');setConfirmExternal(null)}} onCancel={()=>setConfirmExternal(null)} />}
    </>
  )
}

function DashboardView({ modules, onNavigate, mileageUrl, labSafetyUrl, moduleImages }) {
  const { session } = useAppStore()
  const [stats, setStats] = useState({ activeProjects:0, students:0, pendingTraining:0, lowSupplies:0 })
  const [recentInspections, setRecentInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmExternal, setConfirmExternal] = useState(null)
  useEffect(() => { loadStats() }, [])
  async function loadStats() {
    setLoading(true)
    try {
      const isSuperAdmin = !session?.userId
      const orgId = session?.organizationId
      let suppliesQ = sb.from('supplies').select('id,min_qty')
      let projectsQ = sb.from('projects').select('id,status').eq('status','active')
      let studentsQ = sb.from('users').select('id').eq('role','lab_user').eq('is_active',true)
      let inspectionsQ = sb.from('inspections').select('id,room_name,inspected_at,flag_count,inspector').order('inspected_at',{ascending:false}).limit(5)
      let trainingQ = sb.from('training_fresh').select('id').eq('admin_approved',false)
      if (!isSuperAdmin && orgId) {
        suppliesQ = suppliesQ.eq('organization_id', orgId)
        projectsQ = projectsQ.eq('organization_id', orgId)
        studentsQ = studentsQ.eq('organization_id', orgId)
        inspectionsQ = inspectionsQ.eq('organization_id', orgId)
        // training_fresh has no organization_id — filter via org user IDs
        const { data: orgUsers } = await sb.from('users').select('id').eq('organization_id', orgId).eq('is_active', true)
        const orgUserIds = (orgUsers || []).map(u => u.id)
        trainingQ = orgUserIds.length ? trainingQ.in('user_id', orgUserIds) : Promise.resolve({ data: [] })
      }
      const [supplies,projects,students,inspections,training] = await Promise.all([
        suppliesQ, projectsQ, studentsQ, inspectionsQ, trainingQ,
      ])
      setStats({ lowSupplies:(supplies.data||[]).length, activeProjects:(projects.data||[]).length, students:(students.data||[]).length, pendingTraining:(training.data||[]).length })
      setRecentInspections(inspections.data||[])
    } catch(e) {}
    setLoading(false)
  }
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:20, alignItems:'start' }}>
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
            {[
              { label:'Active projects',       value:stats.activeProjects,  color:'#534AB7', screen:'projects' },
              { label:'Active lab users',        value:stats.students,        color:'#0369a1', screen:'training' },
              { label:'Pending cert approvals', value:stats.pendingTraining, color:'#c84b2f', screen:'training' },
              { label:'Supply items tracked',   value:stats.lowSupplies,     color:'#1D9E75', screen:'home'     },
            ].map(s => (
              <a key={s.label} href="#" onClick={e=>{e.preventDefault();onNavigate(s.screen)}} onTouchEnd={e=>{e.preventDefault();onNavigate(s.screen)}} style={{ display:'block', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'16px 20px', cursor:'pointer', transition:'all 0.15s', touchAction:'manipulation', WebkitTapHighlightColor:'transparent', textDecoration:'none' }} onMouseEnter={e=>e.currentTarget.style.borderColor=s.color} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                <div style={{ fontSize:28, fontWeight:600, color:s.color, marginBottom:4 }}>{loading?'—':s.value}</div>
                <div style={{ fontSize:13, color:'var(--text2)' }}>{s.label}</div>
              </a>
            ))}
          </div>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'16px 20px' }}>
            <div style={{ fontSize:12, fontWeight:500, color:'var(--text3)', fontFamily:'var(--mono)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>Recent inspections</div>
            {loading?<div style={{ textAlign:'center',padding:16 }}><div className="spinner" style={{ margin:'0 auto' }} /></div>
              :recentInspections.length===0?<div style={{ fontSize:13,color:'var(--text3)',textAlign:'center',padding:16 }}>No inspections yet.</div>
              :recentInspections.map(r=>(
                <div key={r.id} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--surface2)' }}>
                  <div><div style={{ fontSize:14,fontWeight:500 }}>{r.room_name}</div><div style={{ fontSize:12,color:'var(--text3)',fontFamily:'var(--mono)' }}>{new Date(r.inspected_at).toLocaleDateString()} · {r.inspector}</div></div>
                  {r.flag_count>0?<span style={{ fontSize:12,color:'var(--accent2)',fontWeight:500 }}>{r.flag_count} low</span>:<span style={{ fontSize:12,color:'var(--accent)',fontWeight:500 }}>All OK</span>}
                </div>
              ))}
          </div>
        </div>
        <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
          <div style={{ fontSize:12,fontWeight:500,color:'var(--text3)',fontFamily:'var(--mono)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6 }}>Quick access</div>
          {modules.map(m=>(
            <a key={m.key} href="#" onClick={e=>{e.preventDefault();m.external?setConfirmExternal({url:m.key==='mileage'?mileageUrl:labSafetyUrl}):onNavigate(m.screen)}} onTouchEnd={e=>{e.preventDefault();m.external?setConfirmExternal({url:m.key==='mileage'?mileageUrl:labSafetyUrl}):onNavigate(m.screen)}}
              style={{ display:'block',borderRadius:'var(--radius-lg)',overflow:'hidden',cursor:'pointer',height:56,position:'relative',border:'1px solid var(--border)',transition:'all 0.15s',touchAction:'manipulation',WebkitTapHighlightColor:'transparent',textDecoration:'none',backgroundColor:m.bg,backgroundImage:moduleImages[m.key]?`url(${moduleImages[m.key]})`:'none',backgroundSize:'cover',backgroundPosition:'center',backgroundRepeat:'no-repeat' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor=m.color} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
              {moduleImages[m.key] && <div style={{ position:'absolute',inset:0,background:'linear-gradient(to right,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.2) 100%)',pointerEvents:'none' }} />}
              <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',gap:12,padding:'0 14px',pointerEvents:'none' }}>
                {!moduleImages[m.key]&&<span style={{ fontSize:18,flexShrink:0 }}>{m.icon}</span>}
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:13,fontWeight:600,color:moduleImages[m.key]?'#fff':'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.label}</div>
                  <div style={{ fontSize:10,color:moduleImages[m.key]?'rgba(255,255,255,0.75)':'var(--text3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.sub}</div>
                </div>
                {m.external&&<span style={{ fontSize:10,color:moduleImages[m.key]?'rgba(255,255,255,0.7)':'var(--text3)',flexShrink:0 }}>↗</span>}
              </div>
            </a>
          ))}
        </div>
      </div>
      {confirmExternal&&<ExternalLinkModal url={confirmExternal.url} onConfirm={()=>{window.open(confirmExternal.url,'_blank');setConfirmExternal(null)}} onCancel={()=>setConfirmExternal(null)} />}
    </>
  )
}

// ── Support Inbox modal (super admin only) ────────────────────
function SupportInbox({ onClose, onRead }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter]     = useState('open')

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    let q = sb.from('support_messages').select('*').order('created_at', { ascending: false })
    if (filter !== 'all') q = q.eq('status', filter)
    const { data } = await q
    setMessages(data || [])
    setLoading(false)
  }

  async function setStatus(id, status) {
    await sb.from('support_messages').update({ status }).eq('id', id)
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status } : m))
    if (selected?.id === id) setSelected(s => ({ ...s, status }))
    onRead()
  }

  async function deleteMsg(id) {
    if (!confirm('Delete this message?')) return
    await sb.from('support_messages').delete().eq('id', id)
    setMessages(prev => prev.filter(m => m.id !== id))
    if (selected?.id === id) setSelected(null)
    onRead()
  }

  const statusColor = { open: '#ef4444', read: '#f59e0b', resolved: '#10b981' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.45)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 960, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>💬 Customer Service Inbox</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {['open','read','resolved','all'].map(f => (
              <button key={f} onClick={() => { setFilter(f); setSelected(null) }}
                style={{ padding: '4px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: filter === f ? 'var(--accent)' : 'var(--surface2)', color: filter === f ? '#fff' : 'var(--text2)' }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <button onClick={onClose} style={{ marginLeft: 6, background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 4px' }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* Message list */}
          <div style={{ width: 280, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--border)', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loading
              ? <div className="spinner" style={{ margin: '40px auto' }} />
              : messages.length === 0
                ? <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, marginTop: 60 }}>No messages</div>
                : messages.map(m => (
                  <div key={m.id} onClick={() => { setSelected(m); if (m.status === 'open') setStatus(m.id, 'read') }}
                    style={{ padding: '12px 12px', borderRadius: 10, border: `1.5px solid ${selected?.id === m.id ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', background: selected?.id === m.id ? 'var(--accent-light)' : 'var(--surface)', transition: 'all 0.12s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[m.status] || '#ccc', flexShrink: 0 }} />
                      <div style={{ fontSize: 13, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{m.user_name || m.user_email}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(m.created_at).toLocaleDateString()}</div>
                  </div>
                ))
            }
          </div>

          {/* Message detail */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {!selected ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', gap: 10 }}>
                <div style={{ fontSize: 36 }}>💬</div>
                <div style={{ fontSize: 14 }}>Select a message to read</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Message header */}
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}>{selected.subject}</div>
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 99, background: selected.status === 'open' ? '#FEE2E2' : selected.status === 'resolved' ? '#D1FAE5' : '#FEF3C7', color: selected.status === 'open' ? '#991B1B' : selected.status === 'resolved' ? '#065F46' : '#92400E' }}>
                      {selected.status.charAt(0).toUpperCase() + selected.status.slice(1)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 13, color: 'var(--text2)' }}>
                    <span>👤 <strong>{selected.user_name || 'Unknown'}</strong></span>
                    <span>✉️ {selected.user_email}</span>
                    <span>🕐 {new Date(selected.created_at).toLocaleString()}</span>
                  </div>
                </div>

                {/* Message body */}
                <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
                  <div style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.8, whiteSpace: 'pre-wrap', background: 'var(--surface2)', borderRadius: 10, padding: '16px 20px' }}>
                    {selected.message}
                  </div>
                  {selected.attachment_url && (
                    <div style={{ marginTop: 16 }}>
                      <a href={selected.attachment_url} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', border: '1px solid var(--accent)', borderRadius: 8, fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                        📎 View attachment
                      </a>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', background: 'var(--surface)', flexShrink: 0 }}>
                  <a href={`mailto:${selected.user_email}?subject=Re: ${encodeURIComponent(selected.subject)}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: 'var(--accent)', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                    ✉️ Reply by email
                  </a>
                  {selected.status !== 'resolved'
                    ? <button onClick={() => setStatus(selected.id, 'resolved')} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>✓ Mark resolved</button>
                    : <button onClick={() => setStatus(selected.id, 'open')} className="btn" style={{ fontSize: 14, padding: '8px 16px' }}>Reopen</button>
                  }
                  <button onClick={() => deleteMsg(selected.id)} style={{ marginLeft: 'auto', padding: '8px 16px', background: 'none', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Super admin home view ─────────────────────────────────────
function SuperAdminDashboard({ session, setScreen, greeting, dateStr }) {
  const [inboxOpen, setInboxOpen]     = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => { loadUnread() }, [])

  async function loadUnread() {
    const { count } = await sb.from('support_messages').select('id', { count: 'exact', head: true }).eq('status', 'open')
    setUnreadCount(count || 0)
  }

  const card = (onClick, bg, color, border, icon, label, badge) => (
    <div onClick={onClick} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 10, background: bg, color, border: border || 'none', borderRadius: 'var(--radius-lg)', padding: '14px 24px', cursor: 'pointer', fontWeight: 600, fontSize: 15, boxShadow: bg !== 'var(--surface2)' ? '0 2px 10px rgba(0,0,0,0.12)' : 'none', transition: 'opacity 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      {label}
      {badge > 0 && (
        <span style={{ position: 'absolute', top: -8, right: -8, minWidth: 20, height: 20, borderRadius: 99, background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid var(--bg)' }}>
          {badge}
        </span>
      )}
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.6px', lineHeight: 1.2, marginBottom: 4 }}>{greeting()}, {session?.username}</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{dateStr} · ICT-Lab Super Admin</div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {card(() => setScreen('orgadmin'), 'var(--accent)', '#fff', null, '⚙️', 'Admin Panel', 0)}
        {card(() => setInboxOpen(true),    'var(--surface2)', 'var(--text)', '1px solid var(--border)', '💬', 'Customer Service', unreadCount)}
        {card(() => setScreen('profile'),  'var(--surface2)', 'var(--text)', '1px solid var(--border)', '🔐', 'Profile', 0)}
      </div>
      {inboxOpen && <SupportInbox onClose={() => setInboxOpen(false)} onRead={loadUnread} />}
    </div>
  )
}

function SafetyGate({ onGoToTraining }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 32, textAlign: 'center', gap: 16 }}>
      <div style={{ fontSize: 64 }}>🔒</div>
      <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--text)', letterSpacing: '-0.4px' }}>Safety Training Required</div>
      <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8, maxWidth: 400 }}>
        You must complete all 4 ICT safety training steps before accessing lab features.
        Your progress is saved — pick up where you left off.
      </div>
      <button onClick={onGoToTraining}
        style={{ padding: '12px 32px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8, boxShadow: '0 4px 12px rgba(29,158,117,0.3)' }}>
        Go to Safety Training →
      </button>
    </div>
  )
}

export default function Dashboard() {
  const { session, screen, setScreen, setSidebarSubTab, activeModules, setActiveModules } = useAppStore()
  const [view, setView] = useState(() => localStorage.getItem('labstock_view') || 'grid')
  const [mileageUrl, setMileageUrl] = useState('https://bw4qh7p8sn.us-east-1.awsapprunner.com/')
  const [labSafetyUrl, setLabSafetyUrl] = useState('https://canvas.illinois.edu/')
  const [editingUrl, setEditingUrl] = useState(null)
  const [urlInput, setUrlInput] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)
  const [userAccess, setUserAccess] = useState(null)
  const [studentAllowedPool, setStudentAllowedPool] = useState(null)
  const [safetyComplete, setSafetyComplete] = useState(null)
  // Module card images: seed from localStorage cache (stale-while-revalidate)
  // so repeat visits paint images on the first frame instead of flashing the
  // emoji fallback while loadSettings() round-trips to Supabase.
  const imgCacheKey = `ictlab_module_imgs_${session?.loginMode || 'team'}_${session?.organizationId || 'global'}`
  const [moduleImages, setModuleImages] = useState(() => {
    const base = import.meta.env.BASE_URL
    const defaults = {   // local SVGs — always available, no fetch needed
      pm: `${base}icon-pm.svg`, barcode: `${base}icon-barcode.svg`,
      barcodeqr: `${base}icon-barcodeqr.svg`, profile: `${base}icon-profile.svg`,
      supply: `${base}icon-supply.svg`,
      projects: `${base}icon-projects.svg`, booking: `${base}icon-booking.svg`,
    }
    try { return { ...defaults, ...(JSON.parse(localStorage.getItem(imgCacheKey) || 'null') || {}) } } catch { return defaults }
  })
  const [orgName, setOrgName] = useState('')
  const [customLinks, setCustomLinks] = useState([])
  const [soloPoolFilter, setSoloPoolFilter] = useState(null)

  const isAdmin   = session?.role === 'admin'
  const isStudent = session?.role === 'lab_user'
  const isSolo    = session?.loginMode === 'solo'
  const loginMode = session?.loginMode || 'team'

  useEffect(() => {
    if (session?.userId && (session?.role === 'user' || session?.role === 'admin' || session?.role === 'lab_user')) {
      sb.from('user_screen_access').select('screen_key').eq('user_id', session.userId)
        .then(({ data }) => { if (data?.length) setUserAccess(new Set(data.map(r => r.screen_key))) })
    }
  }, [session?.userId])

  useEffect(() => { loadDashboardPrefs() }, [session?.userId, session?.loginMode])

  useEffect(() => {
    if (!isStudent || !session?.userId) { setSafetyComplete(true); return }
    sb.from('lab_safety_progress')
      .select('step_number')
      .eq('user_id', session.userId)
      .eq('completed', true)
      .then(({ data }) => {
        const done = new Set((data || []).map(r => r.step_number))
        setSafetyComplete([1, 2, 3, 4].every(n => done.has(n)))
      })
      .catch(() => setSafetyComplete(true))
  }, [session?.userId, isStudent, screen])

  async function loadDashboardPrefs() {
    try {
      if (!session?.loginMode) return
      // Always fetch the solo pool for render-time filtering — this must happen before the
      // early-return below so soloPoolFilter is correct even after Dashboard remounts.
      if (isSolo && session?.userId) {
        sb.from('settings').select('value').eq('key', 'solo_allowed_modules').maybeSingle()
          .then(({ data }) => { try { setSoloPoolFilter(data?.value ? JSON.parse(data.value) : null) } catch {} })
      }
      // If activeModules is already set (e.g., just saved from Profile), don't overwrite it
      // with a DB re-fetch. Only fetch when null (initial load, page reload, or after logout).
      if (activeModules !== null) return
      if (!session?.userId) {
        const saved = localStorage.getItem('ictlab_admin_modules')
        setActiveModules(saved ? JSON.parse(saved) : null)
        return
      }
      if (isSolo) {
        const [soloRes, settingsRes] = await Promise.all([
          sb.from('solo_users').select('active_modules, custom_external_links').eq('id', session.userId).maybeSingle(),
          sb.from('settings').select('value').eq('key', 'solo_allowed_modules').maybeSingle(),
        ])
        let mods = soloRes.data?.active_modules
        let soloPool = null
        try { soloPool = settingsRes?.data?.value ? JSON.parse(settingsRes.data.value) : null } catch {}
        setSoloPoolFilter(soloPool)
        if (soloPool !== null) {
          if (mods?.length) {
            const filtered = mods.filter(k => soloPool.includes(k) || k === 'profile')
            const missing = soloPool.filter(k => !filtered.includes(k) && k !== 'profile')
            mods = [...filtered, ...missing]
          } else {
            mods = soloPool
          }
          // Write filtered result back to DB so stale removed modules don't persist
          const original = soloRes.data?.active_modules
          const changed = !original || original.length !== mods.length || mods.some((k, i) => k !== original[i])
          if (changed) {
            sb.from('solo_users').update({ active_modules: mods }).eq('id', session.userId).then(() => {})
          }
        }
        setActiveModules(mods?.length ? mods : null)
        setCustomLinks((soloRes.data?.custom_external_links || []).filter(l => l.enabled))
      } else {
        const [prefsRes, orgResRaw, appRes] = await Promise.all([
          sb.from('user_dashboard_prefs').select('active_modules, allowed_modules, has_set_dashboard').eq('user_id', session.userId).order('created_at', { ascending: false }).limit(1),
          session?.organizationId
            ? sb.from('organizations').select('allowed_modules, allowed_modules_labusers, allowed_modules_labmanagers').eq('id', session.organizationId).maybeSingle()
            : Promise.resolve(null),
          sb.from('settings').select('value').eq('key', 'app_allowed_modules').maybeSingle(),
        ])
        // If new role-pool columns don't exist yet (migration not run), fall back to base query
        let orgRes = orgResRaw
        if (orgResRaw?.error && session?.organizationId) {
          orgRes = await sb.from('organizations').select('allowed_modules').eq('id', session.organizationId).maybeSingle()
        }
        const row = prefsRes.data?.[0]
        let mods = row?.active_modules
        const userHasConfigured = row?.has_set_dashboard === true
        try {
          let appPool = null
          try { appPool = appRes?.data?.value ? JSON.parse(appRes.data.value) : null } catch {}
          // Role-specific org pool: students use labusers pool, staff use labmanagers pool
          const outerOrgPool = session?.role === 'lab_user'
            ? (orgRes?.data?.allowed_modules_labusers ?? orgRes?.data?.allowed_modules)
            : session?.role === 'user'
              ? (orgRes?.data?.allowed_modules_labmanagers ?? orgRes?.data?.allowed_modules)
              : orgRes?.data?.allowed_modules
          const orgPool = outerOrgPool || null
          const effectivePool = orgPool ?? appPool
          if (effectivePool !== null) {
            if (mods?.length) {
              // Remove modules no longer in the pool; always keep profile, staff-pinned, and staffOnly for staff
              const isStaffUser = session?.role === 'admin' || session?.role === 'user'
              const staffOnlyKeys = new Set(ALL_MODULES_META.filter(m => m.staffOnly).map(m => m.key))
              const filtered = mods.filter(k => effectivePool.includes(k) || k === 'profile' || (isStaffUser && STAFF_PINNED_MODULES.includes(k)) || (isStaffUser && staffOnlyKeys.has(k)))
              if (userHasConfigured) {
                mods = filtered
              } else {
                // User never configured — append newly-added pool modules so they appear automatically
                const missing = effectivePool.filter(k => !filtered.includes(k) && k !== 'profile' && !(isStaffUser && STAFF_PINNED_MODULES.includes(k)))
                mods = [...filtered, ...missing]
              }
            } else if (session?.role !== 'lab_user') {
              // No saved prefs — pool defines what's visible (not for students: they see nothing until admin assigns)
              mods = effectivePool
            }
          }
          // For staff with no saved mods OR only default profile (not user-configured), default labmanagement to first position
          if ((session?.role === 'admin' || session?.role === 'user') && (!mods?.length || (mods.length === 1 && mods[0] === 'profile' && !userHasConfigured))) {
            const staffPool = effectivePool ??
              ALL_MODULES_META.filter(m => !m.soloLocked && !m.studentOnly).map(m => m.key)
            const withLabFirst = staffPool.includes('labmanagement')
              ? ['labmanagement', ...staffPool.filter(k => k !== 'labmanagement')]
              : staffPool
            mods = withLabFirst
          }
          // Ensure profile is always present for all team users
          if (mods && !mods.includes('profile')) mods = [...mods, 'profile']
        } catch {}
        // Ensure training is always visible for lab users (backfill for accounts saved before training was added)
        if (session?.role === 'lab_user' && mods?.length && !mods.includes('training')) {
          mods = [...mods, 'training']
        }
        // Lab users with no saved config see all their allowed modules
        setActiveModules(mods?.length ? mods : null)
        if (session?.role === 'lab_user') {
          setStudentAllowedPool(new Set(row?.allowed_modules || []))
        }
      }
    } catch(e) {}
  }

  const allModules = (() => {
    const base = getModules(session?.role, loginMode, activeModules)
    // For staff: auto-include adminOnly modules that admin has explicitly granted via user_screen_access
    if (session?.role === 'user' && userAccess) {
      const baseKeys = new Set(base.map(m => m.key))
      ALL_MODULES_META.forEach(m => {
        if (m.adminOnly && m.screen && userAccess.has(m.screen) && !baseKeys.has(m.key)) base.push(m)
      })
    }
    return base
  })()
  // Screens not managed by user_screen_access (always allowed if in activeModules)
  const UNMANAGED_SCREENS = new Set(['profile', 'dashboard', 'pm', 'barcode', 'barcodeqr', 'orgadmin', 'home', 'equipment', 'labmanagement'])
  const modules = (() => {
    let list = userAccess
      ? allModules.filter(m => m.external || !m.screen || UNMANAGED_SCREENS.has(m.screen) || userAccess.has(m.screen))
      : allModules
    if (isSolo && soloPoolFilter !== null) {
      list = list.filter(m => soloPoolFilter.includes(m.key) || m.key === 'profile')
    }
    return list
  })()

  useEffect(() => { loadSettings() }, [session?.userId, screen])
  async function loadSettings() {
    const base = import.meta.env.BASE_URL
    const imgs = {
      pm:        `${base}icon-pm.svg`,
      barcode:   `${base}icon-barcode.svg`,
      barcodeqr: `${base}icon-barcodeqr.svg`,
      profile:   `${base}icon-profile.svg`,
      supply:    `${base}icon-supply.svg`,
      projects:  `${base}icon-projects.svg`,
      booking:   `${base}icon-booking.svg`,
    }

    const imgPrefix = isSolo ? 'solo_img_' : 'img_'

    // Build explicit list of image setting keys for all modules
    const imgKeys = ALL_MODULES_META.map(m => `${imgPrefix}${m.key}`)

    // Load URL settings + global icon images in parallel
    const [{ data: settingsData }, { data: allImgData }] = await Promise.all([
      sb.from('settings').select('key, value').in('key', ['mileage_url', 'labsafety_url']),
      sb.from('settings').select('key, value').in('key', imgKeys),
    ])
    ;(settingsData || []).forEach(r => {
      if (r.key === 'mileage_url') setMileageUrl(r.value)
      else if (r.key === 'labsafety_url') setLabSafetyUrl(r.value)
    })
    // Apply global images uploaded by super admin
    ;(allImgData || []).forEach(r => {
      const moduleKey = r.key.slice(imgPrefix.length)
      if (r.value) imgs[moduleKey] = r.value
    })

    // Override with per-org images and fetch org name for team users
    if (session?.organizationId && !isSolo) {
      const { data: orgData } = await sb.from('organizations').select('name, module_images').eq('id', session.organizationId).maybeSingle()
      if (orgData?.name) setOrgName(orgData.name)
      Object.entries(orgData?.module_images || {}).forEach(([k, v]) => { if (v) imgs[k] = v })
    }

    setModuleImages(imgs)
    try { localStorage.setItem(imgCacheKey, JSON.stringify(imgs)) } catch { /* storage full/blocked — cache is best-effort */ }
  }

  async function saveModuleOrder(keys) {
    setActiveModules(keys)
    try {
      if (loginMode === 'solo' && session?.userId) {
        await sb.from('solo_users').update({ active_modules: keys, has_set_dashboard: true }).eq('id', session.userId)
      } else if (session?.userId) {
        const { data: updated } = await sb.from('user_dashboard_prefs')
          .update({ active_modules: keys, has_set_dashboard: true })
          .eq('user_id', session.userId).select('id')
        if (!updated?.length)
          await sb.from('user_dashboard_prefs').insert({ user_id: session.userId, active_modules: keys, has_set_dashboard: true })
      } else {
        localStorage.setItem('ictlab_admin_modules', JSON.stringify(keys))
      }
    } catch (e) { console.error('Failed to save module order:', e) }
  }

  async function saveUrl() {
    if (!urlInput.trim()) return
    setSavingUrl(true)
    const key = editingUrl === 'mileage' ? 'mileage_url' : 'labsafety_url'
    await sb.from('settings').upsert({ key, value: urlInput.trim() }, { onConflict: 'key' })
    if (editingUrl === 'mileage') setMileageUrl(urlInput.trim())
    else setLabSafetyUrl(urlInput.trim())
    setEditingUrl(null); setSavingUrl(false)
  }

  function switchView(v) { setView(v); localStorage.setItem('labstock_view', v) }

  const greeting = () => { const h = new Date().getHours(); if (h<12) return 'Good morning'; if (h<17) return 'Good afternoon'; return 'Good evening' }
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const now = new Date()
  const dateStr = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`

  const isSuperAdmin = isAdmin && !session?.userId

  // Super admin: greeting + shortcut cards
  if (isSuperAdmin) return <SuperAdminDashboard session={session} setScreen={setScreen} greeting={greeting} dateStr={dateStr} />


  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontSize:26, fontWeight:600, letterSpacing:'-0.6px', lineHeight:1.2, marginBottom:4 }}>{greeting()}, {session?.username}</div>
          <div style={{ fontSize:13, color:'var(--text3)', fontFamily:'var(--mono)' }}>{dateStr}{orgName ? ` · ICT-Lab for ${orgName}` : ''}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {!isStudent && (
            <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'var(--radius)', padding:4, gap:2 }}>
              <button onClick={() => switchView('grid')} style={{ padding:'6px 14px', border:'none', borderRadius:8, fontFamily:'var(--sans)', fontSize:13, fontWeight:500, cursor:'pointer', background:view==='grid'?'var(--surface)':'transparent', color:view==='grid'?'var(--text)':'var(--text2)', transition:'all 0.15s' }}>⊞ Cards</button>
              <button onClick={() => switchView('dashboard')} style={{ padding:'6px 14px', border:'none', borderRadius:8, fontFamily:'var(--sans)', fontSize:13, fontWeight:500, cursor:'pointer', background:view==='dashboard'?'var(--surface)':'transparent', color:view==='dashboard'?'var(--text)':'var(--text2)', transition:'all 0.15s' }}>☰ Dashboard</button>
            </div>
          )}
          {isStudent && (
            <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'var(--radius)', padding:4, gap:2 }}>
              <button onClick={() => switchView('grid')} style={{ padding:'6px 14px', border:'none', borderRadius:8, fontFamily:'var(--sans)', fontSize:13, fontWeight:500, cursor:'pointer', background:view==='grid'?'var(--surface)':'transparent', color:view==='grid'?'var(--text)':'var(--text2)', transition:'all 0.15s' }}>⊞ Cards</button>
              <button onClick={() => switchView('dashboard')} style={{ padding:'6px 14px', border:'none', borderRadius:8, fontFamily:'var(--sans)', fontSize:13, fontWeight:500, cursor:'pointer', background:view==='dashboard'?'var(--surface)':'transparent', color:view==='dashboard'?'var(--text)':'var(--text2)', transition:'all 0.15s' }}>📋 My Activity</button>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div
          onClick={() => setScreen('orgadmin')}
          style={{ flexShrink: 0, display:'flex', alignItems:'center', gap:12, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'14px 20px', marginBottom:20, cursor:'pointer', transition:'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#1D9E75'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(29,158,117,0.12)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}>
          <div style={{ fontSize:28 }}>⚙️</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:600, fontSize:14, color:'var(--text)' }}>Admin Panel</div>
            <div style={{ fontSize:12, color:'var(--text3)' }}>Manage users, access control & organization settings</div>
          </div>
          <div style={{ fontSize:12, color:'var(--text3)' }}>→</div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        {isStudent && safetyComplete === false
          ? <SafetyGate onGoToTraining={() => { setSidebarSubTab('safety'); setScreen('training') }} />
          : <>
              {isStudent && view==='dashboard' && <StudentDashboardView session={session} onNavigate={s=>setScreen(s)} mileageUrl={mileageUrl} moduleImages={moduleImages} activeModules={activeModules} studentAllowedPool={studentAllowedPool} />}
              {isStudent && view==='grid'      && <CardGridView modules={modules} onNavigate={s=>setScreen(s)} mileageUrl={mileageUrl} labSafetyUrl={labSafetyUrl} isAdmin={false} onEditUrl={()=>{}} moduleImages={moduleImages} isStudent={true} activeModules={activeModules} studentAccess={userAccess} studentAllowedPool={studentAllowedPool} />}
              {!isStudent && view==='grid'     && <CardGridView modules={modules} onNavigate={s=>setScreen(s)} mileageUrl={mileageUrl} labSafetyUrl={labSafetyUrl} isAdmin={isAdmin} onEditUrl={(type)=>{setEditingUrl(type);setUrlInput(type==='mileage'?mileageUrl:labSafetyUrl)}} moduleImages={moduleImages} isStudent={false} activeModules={activeModules} customLinks={isSolo ? customLinks : []} onReorder={saveModuleOrder} />}
              {!isStudent && view==='dashboard' && <DashboardView modules={modules} onNavigate={s=>setScreen(s)} mileageUrl={mileageUrl} labSafetyUrl={labSafetyUrl} moduleImages={moduleImages} />}
            </>
        }
      </div>

      {editingUrl !== null && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:28, maxWidth:480, width:'100%', border:'1px solid var(--border)' }}>
            <div style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>{editingUrl==='mileage'?'🚗 Mileage Form URL':'🦺 Lab Safety URL'}</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>Update the external link for the {editingUrl==='mileage'?'Mileage Form':'Lab Safety'} icon.</div>
            <div className="field"><label>Website URL</label><input type="url" value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder="https://..." onKeyDown={e=>e.key==='Enter'&&saveUrl()} /></div>
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button className="btn btn-primary" onClick={saveUrl} disabled={savingUrl||!urlInput.trim()}>{savingUrl?'Saving…':'Save URL'}</button>
              <button className="btn" onClick={()=>setEditingUrl(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
