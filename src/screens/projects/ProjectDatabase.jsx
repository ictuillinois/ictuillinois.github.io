import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'

function fileIcon(type) {
  if (!type) return '📄'
  if (type.includes('pdf')) return '📕'
  if (type.includes('image')) return '🖼️'
  if (type.includes('word') || type.includes('docx')) return '📝'
  if (type.includes('excel') || type.includes('xlsx') || type.includes('spreadsheet')) return '📊'
  if (type.includes('video')) return '🎬'
  if (type.includes('zip') || type.includes('compressed')) return '🗜️'
  return '📄'
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function extractPdfText(file) {
  try {
    const arrayBuffer = await file.arrayBuffer()
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
        script.onload = resolve; script.onerror = reject
        document.head.appendChild(script)
      })
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
    let text = ''
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      text += content.items.map(item => item.str).join(' ') + '\n'
    }
    return text.trim().slice(0, 50000)
  } catch (e) { return '' }
}

async function aiSearch(query, files) {
  if (!query.trim() || !files.length) return files
  const fileList = files.map((f, i) =>
    `[${i}] Name: ${f.file_name}\nDescription: ${f.description || 'none'}\nExtracted text: ${(f.extracted_text || '').slice(0, 500)}`
  ).join('\n\n---\n\n')
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000,
        messages: [{ role: 'user', content: `You are a document search assistant. Given a search query and a list of documents, return the indices of documents that are relevant to the query.\n\nSearch query: "${query}"\n\nDocuments:\n${fileList}\n\nReturn ONLY a JSON array of relevant document indices (e.g. [0, 2, 5]). If none are relevant, return []. No explanation needed.` }]
      })
    })
    const data = await response.json()
    const text = data.content?.[0]?.text || '[]'
    const indices = JSON.parse(text.replace(/```json|```/g, '').trim())
    if (!Array.isArray(indices)) return files
    return indices.map(i => files[i]).filter(Boolean)
  } catch (e) {
    const q = query.toLowerCase()
    return files.filter(f => f.file_name.toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q) || (f.extracted_text || '').toLowerCase().includes(q))
  }
}

function FileCard({ file, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const isImage = file.file_type?.includes('image')
  const isPdf = file.file_type?.includes('pdf')
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 10, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
          {isImage ? <img src={file.file_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : fileIcon(file.file_type)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.file_name}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2, display: 'flex', gap: 10 }}>
            {file.file_size && <span>{formatSize(file.file_size)}</span>}
            <span>{new Date(file.created_at).toLocaleDateString()}</span>
            {file.uploaded_by && <span>by {file.uploaded_by}</span>}
          </div>
          {file.description && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.description}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <a href={file.file_url} target="_blank" rel="noopener" className="btn btn-sm" onClick={e => e.stopPropagation()}>{isPdf || isImage ? '👁️ View' : '⬇️ Download'}</a>
          <button className="btn btn-sm btn-danger" onClick={e => { e.stopPropagation(); onDelete(file) }}>Delete</button>
          <span style={{ fontSize: 13, color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', background: 'var(--surface2)' }}>
          {isImage && <img src={file.file_url} style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 'var(--radius)', marginBottom: file.extracted_text ? 12 : 0 }} />}
          {file.extracted_text
            ? <div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Extracted text preview</div><div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, maxHeight: 150, overflow: 'hidden' }}>{file.extracted_text.slice(0, 600)}{file.extracted_text.length > 600 ? '…' : ''}</div></div>
            : <div style={{ fontSize: 13, color: 'var(--text3)' }}>No text content extracted.</div>
          }
        </div>
      )}
    </div>
  )
}

export default function ProjectDatabase({ project }) {
  const { session, toast } = useAppStore()
  const [files, setFiles] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({ description: '' })
  const [pendingFiles, setPendingFiles] = useState([])
  const inputRef = useRef()
  const searchTimeout = useRef()

  useEffect(() => { load() }, [project.id])
  useEffect(() => { setFiltered(files) }, [files])

  async function load() {
    setLoading(true)
    const { data } = await sb.from('project_files').select('*').eq('project_id', project.id).order('created_at', { ascending: false })
    setFiles(data || []); setLoading(false)
  }

  async function handleSearch(q) {
    setQuery(q); clearTimeout(searchTimeout.current)
    if (!q.trim()) { setFiltered(files); return }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const results = await aiSearch(q, files)
      setFiltered(results); setSearching(false)
    }, 600)
  }

  function handleFileSelect(fileList) { setPendingFiles(Array.from(fileList)); setShowUpload(true) }

  async function uploadFiles() {
    if (!pendingFiles.length) return
    setUploading(true); let uploaded = 0
    for (const file of pendingFiles) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${project.id}/${Date.now()}_${safeName}`
        const { error: upErr } = await sb.storage.from('project-files').upload(path, file, { upsert: false })
        if (upErr) throw upErr
        const { data: urlData } = sb.storage.from('project-files').getPublicUrl(path)
        let extracted_text = ''
        if (file.type.includes('pdf')) { toast('Extracting text from PDF…'); extracted_text = await extractPdfText(file) }
        await sb.from('project_files').insert({ project_id: project.id, file_name: file.name, file_url: urlData.publicUrl, file_type: file.type, file_size: file.size, description: uploadForm.description || null, extracted_text: extracted_text || null, uploaded_by: session?.username || null })
        uploaded++
      } catch (e) { toast(`Failed to upload: ${file.name}`) }
    }
    setUploading(false); setShowUpload(false); setPendingFiles([]); setUploadForm({ description: '' })
    await load(); toast(`${uploaded} file${uploaded !== 1 ? 's' : ''} uploaded successfully.`)
  }

  async function deleteFile(file) {
    if (!confirm(`Delete "${file.file_name}"?`)) return
    const url = new URL(file.file_url)
    const pathParts = url.pathname.split('/project-files/')
    if (pathParts[1]) await sb.storage.from('project-files').remove([pathParts[1]])
    await sb.from('project_files').delete().eq('id', file.id)
    load(); toast('File deleted.')
  }

  function exportIndex() {
    const data = [['LabStock — Project File Index'],['Project:', project.name],['Exported:', new Date().toLocaleString()],[],['File Name','Type','Size','Description','Uploaded By','Date','URL']]
    files.forEach(f => data.push([f.file_name, f.file_type, formatSize(f.file_size), f.description || '', f.uploaded_by || '', new Date(f.created_at).toLocaleDateString(), f.file_url]))
    const ws = XLSX.utils.aoa_to_sheet(data); ws['!cols'] = [{wch:40},{wch:20},{wch:10},{wch:40},{wch:16},{wch:14},{wch:60}]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Files')
    XLSX.writeFile(wb, `${project.name}_files_${new Date().toLocaleDateString('en-CA')}.xlsx`)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>{files.length} file{files.length !== 1 ? 's' : ''} in this project</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {files.length > 0 && <button className="btn btn-sm" onClick={exportIndex}>📊 Export index</button>}
          <button className="btn btn-sm btn-purple" onClick={() => inputRef.current?.click()}>⬆️ Upload files</button>
          <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleFileSelect(e.target.files)} />
        </div>
      </div>

      {files.length > 0 && (
        <div style={{ marginBottom: 20, position: 'relative' }}>
          <input value={query} onChange={e => handleSearch(e.target.value)} placeholder="🔍 AI search — type anything to find it across all files…" style={{ paddingRight: 40 }} />
          {searching && <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /></div>}
          {query && !searching && <button onClick={() => { setQuery(''); setFiltered(files) }} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>✕</button>}
          {query && !searching && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, fontStyle: 'italic' }}>{filtered.length === 0 ? 'No results found.' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''} found`}</div>}
        </div>
      )}

      {files.length === 0 && !loading && (
        <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files) }} onClick={() => inputRef.current?.click()}
          style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: 48, textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent3)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Drop files here or click to upload</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>PDF, images, Word, Excel, or any file type · Text is auto-extracted from PDFs for search</div>
        </div>
      )}

      {files.length > 0 && (
        <div onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent3)' }} onDragLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; handleFileSelect(e.dataTransfer.files) }}
          style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius)', padding: '10px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text3)', marginBottom: 16, transition: 'border-color 0.15s' }}>
          Drag & drop files here to upload
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : filtered.map(f => <FileCard key={f.id} file={f} onDelete={deleteFile} />)
      }

      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 480, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Upload {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''}</div>
            <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16, maxHeight: 160, overflowY: 'auto' }}>
              {pendingFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 13 }}>
                  <span>{fileIcon(f.type)}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>{formatSize(f.size)}</span>
                </div>
              ))}
            </div>
            <div className="field">
              <label>Description (applies to all files in this batch)</label>
              <textarea rows={2} value={uploadForm.description} onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Lab test results, April 2026…" style={{ resize: 'vertical' }} />
            </div>
            {pendingFiles.some(f => f.type.includes('pdf')) && (
              <div style={{ background: 'var(--accent-light)', borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: 13, color: 'var(--accent)', marginBottom: 16 }}>📕 PDF detected — text will be auto-extracted for AI search</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-purple" onClick={uploadFiles} disabled={uploading} style={{ flex: 1 }}>{uploading ? '⏳ Uploading…' : `⬆️ Upload ${pendingFiles.length} file${pendingFiles.length !== 1 ? 's' : ''}`}</button>
              <button className="btn" onClick={() => { setShowUpload(false); setPendingFiles([]) }} disabled={uploading}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
