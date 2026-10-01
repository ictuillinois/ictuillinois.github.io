// Print one rendered 4x6 label node. MaterialLabel styles itself inline, so
// its outerHTML carries its whole appearance into the print window —
// rebuilding the label as a string was how a fourth, drifted copy of it once
// appeared. Shared by every label tab and the Tested labels.
export function printLabelById(elementId, title = 'Material Label') {
  const el = document.getElementById(elementId)?.outerHTML
  if (!el) return
  const css = '@page{size:4in 6in;margin:0}body{margin:0;padding:0;display:flex;align-items:center;justify-content:center;width:4in;height:6in}*{box-sizing:border-box}'
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body>${el}<script>window.onload=function(){window.print();setTimeout(function(){window.close()},800)}<\/script></body></html>`
  window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank', 'width=460,height=700')
}
