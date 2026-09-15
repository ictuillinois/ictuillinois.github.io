import { labelSections, LABEL_TYPE } from '../lib/materialLabel'

function IctLabLogo({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <polygon points="256,10 460,128 460,372 256,490 52,372 52,128" fill="#0C1140" stroke="#FF6B1A" strokeWidth="28" strokeLinejoin="round"/>
      <text x="256" y="290" textAnchor="middle" dominantBaseline="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="96" fontWeight="700" fill="#F5F0DC">ICT-Lab</text>
    </svg>
  )
}

// The printed 4x6 material label — ONE renderer.
//
// This markup existed three times (project storage tab, single-material
// storage tab, material label tab) with three different field sets, so the
// same container could be labelled differently depending on which button was
// pressed. Content comes from labelSections(), sizes from LABEL_TYPE.
//
// Styles are inline on purpose: two of the print paths copy this node's
// outerHTML into a new window, where a stylesheet would not follow it.
//
// Colours are literal, not theme tokens. This is ink on paper.
// qrSize 120. Three headings and three rules already cost more vertical room
// than a flat list, and restoring NMAS makes a plant-mix reduction four lines
// under Original Material — the tallest label there is. At 120px that label
// keeps one spare line for a value that wraps (a long project name is the
// likely one, since project names are not length-capped). 120px prints at
// 1.25in; at 300dpi that is still ~5 dots per QR module, comfortably scannable.
export default function MaterialLabel({ id, material, project, parent, scanUrl, barcodeId, qrSize = 120 }) {
  const sections = labelSections(material, project, parent)
  const isReduction = !!material?.parent_material_id
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize * 2}x${qrSize * 2}&data=${encodeURIComponent(scanUrl || '')}&margin=4&color=000000&bgcolor=ffffff&ecc=H`
  // Keep the logo well under ECC-H's error-correction budget so cameras can
  // still scan it reliably.
  const logoSize = Math.round(qrSize * 0.22)

  return (
    <div id={id} style={{ width: '4in', height: '6in', background: '#fff', border: '1px solid #000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'Arial, sans-serif', gap: 8, boxSizing: 'border-box' }}>
      <div style={{ fontSize: LABEL_TYPE.header, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>
        ICT-Lab &mdash; {isReduction ? 'Reduction Material' : 'Material Storage'}
      </div>

      <div style={{ position: 'relative', width: qrSize, height: qrSize, flexShrink: 0 }}>
        <img src={qrUrl} width={qrSize} height={qrSize} style={{ display: 'block', imageRendering: 'pixelated' }} alt="QR Code" />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: '#fff', borderRadius: 4, padding: 4, lineHeight: 0 }}>
            <IctLabLogo size={logoSize} />
          </div>
        </div>
      </div>

      <div style={{ fontSize: LABEL_TYPE.barcode, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.05em', color: '#000' }}>{barcodeId}</div>

      {/* Grouped, with a grey rule above each group — the first sitting
          directly under the barcode digits. Only the three titles are printed
          as words; everything under them is the value as entered. */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
        {sections.map(sec => (
          <div key={sec.title} style={{ borderTop: '1px solid #999', paddingTop: 5, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ fontSize: LABEL_TYPE.title, fontWeight: 700, color: '#000', textDecoration: 'underline', textUnderlineOffset: 2, lineHeight: 1.3 }}>
              {sec.title}
            </div>
            {sec.values.map((v, k) => (
              // overflowWrap, not nowrap+ellipsis: a value too long for the
              // line wraps and stays readable rather than being cut off.
              <div key={k} style={{ fontSize: LABEL_TYPE.field, fontWeight: 700, color: '#000', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{v}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
