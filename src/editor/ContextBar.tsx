import { useLayoutEffect, useRef, useState } from 'react'
import { IText } from 'fabric'
import type { StudioEditor } from './engine'
import type { ThemeFont } from '../lib/themes'
import { ColorRow } from './ColorRow'
import { FONT_CATS } from '../data/fontLibrary'

type Props = {
  ed: StudioEditor
  fonts: ThemeFont[]
  palette: string[]
  onFont: (f: ThemeFont) => void
}

/** Barre contextuelle flottante : suit la sélection, au-dessus (ou en dessous si pas de place). */
export function ContextBar({ ed, fonts, palette, onFont }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<'color' | 'more' | null>(null)
  const o = ed.active
  const t = o instanceof IText ? o : null
  const moving = !!(o && (o as unknown as { isMoving?: boolean }).isMoving)

  // Placement direct dans le DOM à chaque rendu (pas de setState : évite une boucle de rendus).
  useLayoutEffect(() => {
    const el = ref.current
    if (!o || !el) return
    const r = ed.screenRect(o)
    const host = ed.canvas.getElement().parentElement!.getBoundingClientRect()
    const bw = el.offsetWidth
    const bh = el.offsetHeight
    let top = r.top - bh - 14
    if (top < 8) top = Math.min(r.bottom + 14, host.height - bh - 8)
    el.style.left = Math.min(Math.max(8, (r.left + r.right) / 2 - bw / 2), host.width - bw - 8) + 'px'
    el.style.top = top + 'px'
  })

  // Nouvelle sélection : on referme les menus ouverts.
  const uid = (o as { uid?: string } | undefined)?.uid
  useLayoutEffect(() => setMenu(null), [uid])

  if (!o) return null
  const size = t ? Math.round(t.fontSize ?? 0) : 0
  const color = String(o.fill ?? '#000')

  return (
    <div
      ref={ref}
      className="ctx"
      style={{ left: -9999, top: -9999, opacity: moving ? 0 : 1 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {t && (
        <>
          <select
            aria-label="Police"
            value={t.fontFamily}
            style={{ fontFamily: `"${t.fontFamily}"` }}
            onChange={(e) => { const f = fonts.find((x) => x.name === e.target.value); if (f) onFont(f) }}
          >
            {!fonts.some((f) => f.name === t.fontFamily) && <option>{t.fontFamily}</option>}
            {[{ key: 'template', label: 'Polices du template' }, ...FONT_CATS].map((g) => {
              const list = fonts.filter((f) => ((f as { category?: string }).category ?? 'template') === g.key)
              return list.length ? (
                <optgroup key={g.key} label={g.label}>
                  {list.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                </optgroup>
              ) : null
            })}
          </select>
          <div className="sep" />
          <button aria-label="Réduire la taille" onClick={() => ed.update(t, { fontSize: Math.max(6, size - 2) })}>−</button>
          <span className="num">{size}</span>
          <button aria-label="Augmenter la taille" onClick={() => ed.update(t, { fontSize: size + 2 })}>+</button>
          <div className="sep" />
          <button className={t.fontWeight === 'bold' ? 'on' : ''} aria-label="Gras" onClick={() => ed.update(t, { fontWeight: t.fontWeight === 'bold' ? 'normal' : 'bold' })}><b>G</b></button>
          <button className={t.fontStyle === 'italic' ? 'on' : ''} aria-label="Italique" onClick={() => ed.update(t, { fontStyle: t.fontStyle === 'italic' ? 'normal' : 'italic' })}><i>I</i></button>
          <div className="sep" />
          <div style={{ position: 'relative' }}>
            <button className="swb" aria-label="Couleur" onClick={() => setMenu(menu === 'color' ? null : 'color')}>
              <span className="sw" style={{ background: color, display: 'block' }} />
            </button>
            {menu === 'color' && (
              <div className="pop" style={{ left: -80, right: 'auto' }}>
                <ColorRow value={color} palette={palette} onChange={(c) => ed.update(t, { fill: c })} />
              </div>
            )}
          </div>
          <div className="sep" />
        </>
      )}
      <button title="Dupliquer (Ctrl+D)" aria-label="Dupliquer" onClick={() => ed.duplicate()}>⧉</button>
      <button title="Supprimer (Suppr)" aria-label="Supprimer" onClick={() => ed.remove()}>🗑</button>
      <div style={{ position: 'relative' }}>
        <button aria-label="Plus d'options" onClick={() => setMenu(menu === 'more' ? null : 'more')}>…</button>
        {menu === 'more' && (
          <div className="pop">
            <button onClick={() => { ed.centerH(); setMenu(null) }}>↔ Centrer horizontalement</button>
            <button onClick={() => { ed.forward(); setMenu(null) }}>⬆ Mettre devant</button>
            <button onClick={() => { ed.backward(); setMenu(null) }}>⬇ Mettre derrière</button>
          </div>
        )}
      </div>
    </div>
  )
}
