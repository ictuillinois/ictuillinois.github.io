import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'

export default function History() {
  const { setLastRecord, setScreen, session } = useAppStore()
  const orgId = session?.organizationId
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    let q = sb.from('inspections').select('*').order('inspected_at', { ascending: false }).limit(200)
    if (orgId) q = q.eq('organization_id', orgId)
    const { data } = await q
    setData(data || [])
    setLoading(false)
  }

  async function view(id) {
    const { data } = await sb.from('inspections').select('*').eq('id', id).single()
    if (data) { setLastRecord(data); setScreen('results') }
  }

  if (loading) return <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!data.length) return <div><div className="section-header"><div className="section-title">Inspection history</div></div><div className="empty-state"><div className="empty-icon">📋</div>No inspections yet.</div></div>

  const months = {}
  data.forEach(rec => {
    const d = new Date(rec.inspected_at)
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
    if (!months[key]) months[key] = { label, records: [] }
    months[key].records.push(rec)
  })

  return (
    <div>
      <div className="section-header"><div className="section-title">Inspection history</div></div>
      {Object.keys(months).sort((a,b) => b.localeCompare(a)).map(key => {
        const { label, records } = months[key]
        const open = !collapsed[key]
        return (
          <div key={key} style={{ marginBottom: 24 }}>
            <div onClick={() => setCollapsed(c => ({...c, [key]: !c[key]}))}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{records.length} inspection{records.length!==1?'s':''}</span>
              </div>
              <span style={{ fontSize: 13, color: 'var(--text3)', transition: 'transform 0.2s', transform: open ? 'rotate(0)' : 'rotate(-90deg)' }}>▼</span>
            </div>
            {open && (
              <div style={{ paddingLeft: 4 }}>
                {records.map(rec => (
                  <div key={rec.id} onClick={() => view(rec.id)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor='var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{rec.room_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                        {new Date(rec.inspected_at).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})} · {new Date(rec.inspected_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} · {rec.inspector}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {rec.flag_count > 0
                        ? <div style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 500 }}>{rec.flag_count} low item{rec.flag_count>1?'s':''}</div>
                        : <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>All OK</div>
                      }
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>tap to view →</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
