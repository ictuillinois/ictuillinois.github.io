import { useRef, useState, useEffect } from 'react'

const STEP = 160

export default function ScrollTabs({ children, style, bg = 'var(--surface)' }) {
  const ref = useRef()
  const [left, setLeft] = useState(false)
  const [right, setRight] = useState(false)

  function check() {
    const el = ref.current
    if (!el) return
    setLeft(el.scrollLeft > 2)
    setRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }

  useEffect(() => {
    check()
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', check); ro.disconnect() }
  }, [children])

  function scrollBy(dir) {
    ref.current?.scrollBy({ left: dir * STEP, behavior: 'smooth' })
  }

  const arrowStyle = (side) => ({
    position: 'absolute',
    [side]: 0,
    top: 0,
    bottom: 1,
    width: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    padding: 0,
    color: 'var(--text3)',
    fontSize: 14,
  })

  return (
    <div style={{ position: 'relative', ...style }}>
      {left && (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 1, width: 48, background: `linear-gradient(to right, ${bg} 50%, transparent)`, zIndex: 2, pointerEvents: 'none' }} />
          <button style={arrowStyle('left')} onClick={() => scrollBy(-1)} aria-label="Scroll tabs left">‹</button>
        </>
      )}
      <div ref={ref} style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {children}
      </div>
      {right && (
        <>
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 1, width: 48, background: `linear-gradient(to left, ${bg} 50%, transparent)`, zIndex: 2, pointerEvents: 'none' }} />
          <button style={arrowStyle('right')} onClick={() => scrollBy(1)} aria-label="Scroll tabs right">›</button>
        </>
      )}
    </div>
  )
}
