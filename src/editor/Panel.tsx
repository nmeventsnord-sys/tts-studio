import { useEffect, useMemo, useState } from 'react'
import { FabricImage, IText } from 'fabric'
import type { StudioEditor } from './engine'
import type { ThemeFont } from '../lib/themes'
import { FONT_CATS, loadLibrary, type FontCat, type LibraryFont } from '../data/fontLibrary'
import { fold } from '../lib/themes'
import { loadFont } from '../lib/fonts'
import { ColorRow } from './ColorRow'

type Props = {
  ed: StudioEditor
  themeFonts: ThemeFont[]
  palette: string[]
  onFont: (f: ThemeFont) => void
  onAddText: () => void
}

/** Panneau droit : taille & style, couleur, opacité, espacements, polices du template + bibliothèque. */
export function Panel({ ed, themeFonts, palette, onFont, onAddText }: Props) {
  const o = ed.active
  const t = o instanceof IText ? o : null
  const [lib, setLib] = useState<LibraryFont[]>([])
  const [open, setOpen] = useState<FontCat | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => { loadLibrary().then(setLib) }, [])

  const byCat = useMemo(() => {
    const themeNames = new Set(themeFonts.map((f) => f.name.toLowerCase()))
    const words = fold(q).split(/\s+/).filter(Boolean)
    const m = new Map<FontCat, LibraryFont[]>()
    for (const f of lib) {
      if (themeNames.has(f.name.toLowerCase())) continue
      if (words.length && !words.every((w) => fold(f.name).includes(w))) continue
      m.set(f.category, [...(m.get(f.category) ?? []), f])
    }
    return m
  }, [lib, themeFonts, q])

  // Aperçu dans la vraie police : on charge une catégorie quand on l'ouvre (ou les résultats de recherche).
  useEffect(() => {
    const list = q ? [...byCat.values()].flat().slice(0, 30) : open ? byCat.get(open) ?? [] : []
    list.forEach((f) => loadFont(f))
  }, [open, q, byCat])

  if (!o) {
    return (
      <aside className="panel">
        <h5>RIEN DE SÉLECTIONNÉ</h5>
        <p className="hint">Clique sur un texte ou un élément du template pour le modifier. Double-clique sur un texte pour changer les mots.</p>
        <h5>AJOUTER</h5>
        <button className="pb full" onClick={onAddText}>T Ajouter un texte</button>
        <h5>RACCOURCIS</h5>
        <p className="hint">Ctrl+Z annuler · Ctrl+Y refaire · Ctrl+D dupliquer · Suppr effacer · flèches pour déplacer (Maj = ×10) · Ctrl+molette zoom · Espace + glisser pour se déplacer</p>
      </aside>
    )
  }

  if (o.role === 'zone') {
    const first = o.zone === 1
    return (
      <aside className="panel">
        <h5>PRISE DE VUE {o.zone}</h5>
        <p className="hint">
          La borne placera ici la photo n°{o.zone}. {first
            ? 'Dimensionne cette zone librement : les suivantes reprendront automatiquement ses proportions.'
            : 'Ses proportions suivent la zone 1 : redimensionne-la par les coins.'}
        </p>
        <h5>ORDRE</h5>
        <div className="pr">
          <button className="pb" onClick={() => ed.centerH()}>↔ Centrer</button>
          <button className="pb" onClick={() => ed.duplicate()}>⧉ Dupliquer</button>
          <button className="pb" onClick={() => ed.remove()}>🗑 Supprimer</button>
        </div>
        <p className="hint" style={{ marginTop: 14 }}>À l'envoi, chaque zone devient un trou transparent dans le PNG et reste numérotée sur ton PDF.</p>
      </aside>
    )
  }

  const isImage = o instanceof FabricImage
  const color = String(o.fill ?? '#000')
  const opacity = Math.round((o.opacity ?? 1) * 100)
  const fontRow = (f: ThemeFont, tag?: boolean) => (
    <button key={f.name} className={'fnt' + (t?.fontFamily === f.name ? ' on' : '')} style={{ fontFamily: `"${f.name}", Poppins` }} onClick={() => onFont(f)}>
      <span>{f.name}</span>{tag && <span className="tg">TEMPLATE</span>}
    </button>
  )

  return (
    <aside className="panel">
      {t && (
        <>
          <h5>TAILLE & STYLE</h5>
          <div className="pr">
            <input className="pnum" type="number" min={6} max={600} aria-label="Taille du texte" value={Math.round(t.fontSize ?? 0)}
              onChange={(e) => { const v = Number(e.target.value); if (v >= 6) ed.update(t, { fontSize: v }) }} />
            <button className={'pb' + (t.fontWeight === 'bold' ? ' on' : '')} onClick={() => ed.update(t, { fontWeight: t.fontWeight === 'bold' ? 'normal' : 'bold' })}><b>G</b></button>
            <button className={'pb' + (t.fontStyle === 'italic' ? ' on' : '')} onClick={() => ed.update(t, { fontStyle: t.fontStyle === 'italic' ? 'normal' : 'italic' })}><i>I</i></button>
            <button className={'pb' + (t.underline ? ' on' : '')} onClick={() => ed.update(t, { underline: !t.underline })}><u>S</u></button>
          </div>
          <div className="pr" style={{ marginTop: 6 }}>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={'pb' + (t.textAlign === a ? ' on' : '')} onClick={() => ed.update(t, { textAlign: a })}>
                ≡ {a === 'left' ? 'gauche' : a === 'center' ? 'centre' : 'droite'}
              </button>
            ))}
          </div>
        </>
      )}

      {!isImage && (
        <>
          <h5>COULEUR</h5>
          <ColorRow value={color} palette={palette} onChange={(c) => ed.update(o, { fill: c })} />
        </>
      )}
      {isImage && (
        <>
          <h5>IMAGE</h5>
          <div className="pr">
            <button className="pb" onClick={() => ed.update(o, { flipX: !o.flipX })}>⇋ Retourner</button>
            <button className="pb" onClick={() => ed.update(o, { angle: 0 })}>⟲ Redresser</button>
          </div>
        </>
      )}

      <h5>OPACITÉ</h5>
      <input className="range" type="range" min={10} max={100} value={opacity} aria-label="Opacité"
        onChange={(e) => ed.update(o, { opacity: Number(e.target.value) / 100 })} />

      {t && (
        <>
          <h5>ESPACEMENT</h5>
          <div className="rlab"><span>Lettres</span><span>{Math.round(t.charSpacing ?? 0)}</span></div>
          <input className="range" type="range" min={-100} max={800} step={10} value={t.charSpacing ?? 0} aria-label="Espacement des lettres"
            onChange={(e) => ed.update(t, { charSpacing: Number(e.target.value) })} />
          <div className="rlab"><span>Lignes</span><span>{(t.lineHeight ?? 1).toFixed(2)}</span></div>
          <input className="range" type="range" min={0.7} max={2.5} step={0.05} value={t.lineHeight ?? 1} aria-label="Interligne"
            onChange={(e) => ed.update(t, { lineHeight: Number(e.target.value) })} />

          {themeFonts.length > 0 && <><h5>POLICES DU TEMPLATE</h5>{themeFonts.map((f) => fontRow(f, true))}</>}

          <h5>POLICES EN PLUS</h5>
          <input className="fsearch" placeholder="Rechercher une police…" value={q} onChange={(e) => setQ(e.target.value)} />
          {FONT_CATS.map((c) => {
            const list = byCat.get(c.key) ?? []
            if (!list.length) return null
            const isOpen = !!q || open === c.key
            return (
              <div key={c.key}>
                <button className="fcat" onClick={() => setOpen(open === c.key ? null : c.key)} aria-expanded={isOpen}>
                  {c.emoji} {c.label} <span>{list.length} {isOpen ? '⌄' : '›'}</span>
                </button>
                {isOpen && list.map((f) => fontRow(f))}
              </div>
            )
          })}
        </>
      )}
      <h5>ORDRE</h5>
      <div className="pr">
        <button className="pb" onClick={() => ed.forward()}>⬆ Devant</button>
        <button className="pb" onClick={() => ed.backward()}>⬇ Derrière</button>
        <button className="pb" onClick={() => ed.centerH()}>↔ Centrer</button>
      </div>
    </aside>
  )
}
