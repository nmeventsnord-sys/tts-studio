import { useEffect, useLayoutEffect, useState } from 'react'

export type TutoStep = {
  title: string
  text: string
  /** Rectangle de l'élément visé, en coordonnées de la fenêtre. */
  anchor: () => DOMRect | null
  side: 'right' | 'left' | 'below' | 'above'
  /** Action à faire avant d'afficher l'étape (ex. sélectionner les prénoms). */
  before?: () => void
}

/** Tuto « spotlight » ancré sur les vrais éléments de l'éditeur (recalculé au redimensionnement). */
export function Tutorial({ steps, onClose }: { steps: TutoStep[]; onClose: () => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const s = steps[i]

  useEffect(() => { s?.before?.() }, [i]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const measure = () => setRect(s?.anchor() ?? null)
    measure()
    // re-mesure après la mise en page (barre contextuelle apparue, etc.)
    const id = window.setTimeout(measure, 80)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(id); window.removeEventListener('resize', measure) }
  }, [i, s])

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  if (!s) return null
  const W = 250
  const H = 170
  let left = window.innerWidth / 2 - W / 2
  let top = window.innerHeight / 2 - H / 2
  let cls = ''
  if (rect) {
    if (s.side === 'right') { left = rect.right + 16; top = rect.top + rect.height / 2 - 28; cls = 'l' }
    if (s.side === 'left') { left = rect.left - W - 16; top = rect.top + rect.height / 2 - 28; cls = 'r' }
    if (s.side === 'below') { left = rect.right - W + 20; top = rect.bottom + 14; cls = 't' }
    if (s.side === 'above') { left = rect.left; top = rect.top - H - 14; cls = 'b' }
    left = Math.min(Math.max(8, left), window.innerWidth - W - 8)
    top = Math.min(Math.max(8, top), window.innerHeight - H - 8)
  }
  const last = i === steps.length - 1

  return (
    <>
      {rect && <div className="spot-ring" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      <div className={'spot ' + cls} style={{ left, top }} role="dialog" aria-label={`Tutoriel, étape ${i + 1} sur ${steps.length}`}>
        <span className="n">{i + 1}</span><b>{s.title}</b>
        <p>{s.text}</p>
        <div className="a">
          <button onClick={onClose}>Passer</button>
          <button className="nx" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? "C'est parti !" : 'Suivant'}</button>
        </div>
      </div>
    </>
  )
}
