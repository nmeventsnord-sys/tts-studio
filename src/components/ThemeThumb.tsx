import { useEffect, useRef, useState } from 'react'
import { TemplatePreview } from './TemplatePreview'
import { themeFormats, type EventInfo } from '../data/formats'
import { loadFonts } from '../lib/fonts'
import type { Theme } from '../lib/themes'

const W = 400
const H = 300

/**
 * Vignette de galerie composée à partir des vrais formats du thème (comme la maquette) :
 * un marque-page incliné à gauche, un portrait ou un paysage incliné à droite, avec photos
 * d'exemple et textes dans les polices du thème. Aucune image du vendeur (ni bandeau, ni logo).
 */
export function ThemeThumb({ theme, info }: { theme: Theme; info: EventInfo }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W))
    ro.observe(el)
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect() } }, { rootMargin: '300px' })
    io.observe(el)
    return () => { ro.disconnect(); io.disconnect() }
  }, [])

  useEffect(() => { if (visible) loadFonts(theme.fonts) }, [visible, theme])

  const fmts = themeFormats(theme)
  const strip = fmts.find(([k]) => k === 's4p' || k === 's6p')
  const other = fmts.find(([k]) => k === 'port1') ?? fmts.find(([k]) => k === 'port2') ?? fmts.find(([k]) => k === 'land1') ?? fmts.find(([k]) => k === 'land3')
  const pieces = [strip, other].filter(Boolean) as typeof fmts

  return (
    <div ref={box} className="themethumb">
      {visible && scale > 0 && (
        <div className="tt-stage" style={{ width: W, height: H, transform: `scale(${scale})` }}>
          {pieces.map(([k, f, meta], i) => {
            const land = f.w > f.h
            const h = land ? 170 : pieces.length === 1 ? 250 : 236
            const w = (f.w / f.h) * h
            const left = pieces.length === 1 ? (W - w) / 2 : i === 0 ? 46 : land ? 168 : 206
            const top = (H - h) / 2 + (i === 0 ? 2 : -4)
            return (
              <TemplatePreview
                key={k}
                fmt={f}
                font={theme.font_name}
                info={info}
                category={theme.category}
                bookmark={meta.bookmark}
                width={w}
                className="tt-piece"
                style={{ left, top, transform: `rotate(${pieces.length === 1 ? 0 : i === 0 ? -6 : 5}deg)` }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
