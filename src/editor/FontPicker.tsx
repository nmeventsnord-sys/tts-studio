import { useEffect, useMemo, useRef, useState } from 'react'
import type { ThemeFont } from '../lib/themes'
import { fold } from '../lib/themes'
import { loadFont } from '../lib/fonts'
import { FONT_CATS, templateFonts, type FontCat } from '../data/fontLibrary'

type Props = {
  fonts: ThemeFont[]
  /** Noms de polices déjà utilisés par les textes du document (toujours proposés dans « du template »). */
  used: string[]
  value: string
  onPick: (f: ThemeFont) => void
}

/**
 * Sélecteur de police : chaque nom est écrit dans sa propre police, avec recherche.
 * (Remplace le <select> natif : sa liste ne s'ouvrait pas dans la barre flottante et n'affichait aucun aperçu.)
 */
export function FontPicker({ fonts, used, value, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<FontCat | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  const tpl = useMemo(() => templateFonts(fonts.filter((f) => !(f as { category?: string }).category), used), [fonts, used])
  const tplNames = useMemo(() => new Set(tpl.map((f) => f.name.toLowerCase())), [tpl])
  const lib = useMemo(() => fonts.filter((f) => (f as { category?: string }).category && !tplNames.has(f.name.toLowerCase())), [fonts, tplNames])
  const words = fold(q).split(/\s+/).filter(Boolean)
  const match = (f: ThemeFont) => !words.length || words.every((w) => fold(f.name).includes(w))
  const tplShown = tpl.filter(match)
  const byCat = (k: FontCat) => lib.filter((f) => (f as { category?: string }).category === k).filter(match)

  // Aperçu dans la vraie police : on ne charge que ce qui est affiché.
  useEffect(() => {
    if (!open) return
    const list = [...tplShown, ...(q ? lib.filter(match).slice(0, 30) : cat ? byCat(cat) : [])]
    list.forEach((f) => loadFont(f))
  }, [open, q, cat, tpl, lib]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (f: ThemeFont) => { onPick(f); setOpen(false) }
  const row = (f: ThemeFont) => (
    <button key={f.name} className={'fpk-row' + (f.name === value ? ' on' : '')} style={{ fontFamily: `"${f.name}", Poppins` }} onClick={() => pick(f)}>
      {f.name}
    </button>
  )

  return (
    <div ref={box} className="fpk" onMouseDown={(e) => e.stopPropagation()}>
      <button className="fpk-btn" aria-label="Police" aria-expanded={open} style={{ fontFamily: `"${value}", Poppins` }} onClick={() => setOpen(!open)}>
        <span>{value}</span><i>⌄</i>
      </button>
      {open && (
        <div className="fpk-pop">
          <input autoFocus className="fsearch" placeholder="Rechercher une police…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="fpk-list">
            {tplShown.length > 0 && <><h6>Polices du template</h6>{tplShown.map(row)}</>}
            {q
              ? (() => { const r = lib.filter(match); return r.length ? <><h6>Autres polices</h6>{r.slice(0, 60).map(row)}</> : tplShown.length ? null : <p className="hint">Aucune police ne correspond.</p> })()
              : FONT_CATS.map((c) => {
                  const list = byCat(c.key)
                  if (!list.length) return null
                  return (
                    <div key={c.key}>
                      <button className="fcat" onClick={() => setCat(cat === c.key ? null : c.key)} aria-expanded={cat === c.key}>
                        {c.emoji} {c.label} <span>{list.length} {cat === c.key ? '⌄' : '›'}</span>
                      </button>
                      {cat === c.key && list.map(row)}
                    </div>
                  )
                })}
          </div>
        </div>
      )}
    </div>
  )
}
