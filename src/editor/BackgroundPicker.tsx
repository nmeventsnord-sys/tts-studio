import { useMemo, useState } from 'react'
import { BACKGROUNDS, BACKGROUND_CATS, renderBackground } from './backgrounds'
import type { StudioEditor } from './engine'

const thumbs = new Map<string, string>()
/** Vignette (même dessin que le rendu final, à petite échelle), mise en cache. */
function thumb(id: string, w: number, h: number) {
  const k = `${id}:${w}x${h}`
  let u = thumbs.get(k)
  if (!u) { u = renderBackground(id, w, h).toDataURL('image/jpeg', 0.8); thumbs.set(k, u) }
  return u
}

/** Bibliothèque de fonds (86 fonds générés par code) + couleur unie + retour au fond du thème. */
export function BackgroundPicker({ ed, themeSrc, onDone }: { ed: StudioEditor; themeSrc?: string; onDone: (msg: string) => void }) {
  const [cat, setCat] = useState(BACKGROUND_CATS[0].id)
  const list = useMemo(() => BACKGROUNDS.filter((b) => b.cat === cat), [cat])
  const tw = 64
  const th = Math.round(tw * (ed.h / (ed.bookmark ? ed.w / 2 : ed.w)))
  const current = ed.background?.kind === 'generated' ? ed.background.id : null

  const pick = (id: string, name: string) => { ed.setGeneratedBackground(id); ed.record(true); onDone(`Fond <b>${name}</b> appliqué`) }

  return (
    <div className="flyout bgpick" style={{ top: 180 }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="bgtabs">
        {BACKGROUND_CATS.map((c) => (
          <button key={c.id} className={'chip sm' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name}</button>
        ))}
      </div>
      <div className="bggrid">
        {list.map((b) => (
          <button key={b.id} className={'bgthumb' + (current === b.id ? ' on' : '')} title={b.name} onClick={() => pick(b.id, b.name)}>
            <img src={thumb(b.id, tw, th)} alt={b.name} width={tw} height={th} />
          </button>
        ))}
      </div>
      <div className="pr" style={{ padding: '8px 4px 2px' }}>
        <label className="pb swin" title="Couleur unie">
          🎨 Couleur unie
          <input type="color" onChange={(e) => { ed.setBackgroundColor(e.target.value); ed.record(true) }} />
        </label>
        {themeSrc && (
          <button className="pb" onClick={() => { ed.applyBackground({ kind: 'theme', src: themeSrc }).then(() => { ed.record(true); onDone('Fond du thème rétabli') }) }}>
            ↺ Fond du thème
          </button>
        )}
      </div>
    </div>
  )
}
