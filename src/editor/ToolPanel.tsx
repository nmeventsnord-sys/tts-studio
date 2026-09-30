import type { StudioEditor, Tool } from './engine'

const INFO: Record<Exclude<Tool, 'select'>, { title: string; text: string }> = {
  hand: {
    title: 'MAIN MAGIQUE',
    text: "Clique sur un motif du design (fleur, feuille, logo…) : il se détache du fond et devient un élément que tu peux déplacer, agrandir ou supprimer.",
  },
  wand: {
    title: 'BAGUETTE MAGIQUE',
    text: "Clique sur une couleur d'une image importée : toute la zone de cette couleur devient transparente. Idéal pour enlever un fond blanc de logo.",
  },
  eraser: {
    title: 'GOMME',
    text: 'Peins sur une image importée pour en effacer une partie. Chaque coup de gomme peut être annulé (Ctrl+Z).',
  },
}

/** Réglages de l'outil actif (remplace le panneau de sélection). */
export function ToolPanel({ ed }: { ed: StudioEditor }) {
  if (ed.tool === 'select') return null
  const info = INFO[ed.tool]
  const o = ed.toolOpts
  const set = (patch: Partial<typeof o>) => { Object.assign(o, patch); ed.canvas.requestRenderAll(); ed.touch() }
  return (
    <aside className="panel" key={ed.tool}>
      <h5>{info.title}</h5>
      <p className="hint">{info.text}</p>
      {ed.tool !== 'eraser' && (
        <>
          <h5>TOLÉRANCE</h5>
          <div className="rlab"><span>Précis</span><span>{o.tol}</span><span>Large</span></div>
          <input className="range" type="range" min={2} max={90} defaultValue={o.tol} aria-label="Tolérance" onChange={(e) => set({ tol: Number(e.target.value) })} />
        </>
      )}
      {ed.tool === 'wand' && (
        <label className="pr" style={{ marginTop: 8, cursor: 'pointer' }}>
          <input type="checkbox" defaultChecked={o.contiguous} onChange={(e) => set({ contiguous: e.target.checked })} /> Zones contiguës seulement
        </label>
      )}
      {ed.tool === 'eraser' && (
        <>
          <h5>TAILLE DE LA GOMME</h5>
          <div className="rlab"><span>Fine</span><span>{o.brush}px</span><span>Large</span></div>
          <input className="range" type="range" min={6} max={160} defaultValue={o.brush} aria-label="Taille de la gomme" onChange={(e) => set({ brush: Number(e.target.value) })} />
        </>
      )}
      {ed.busy && <p className="hint" style={{ marginTop: 12 }}>⏳ Traitement en cours…</p>}
      <button className="btn" style={{ marginTop: 16, height: 38 }} onClick={() => ed.setTool('select')}>Terminer</button>
      <p className="hint" style={{ marginTop: 8 }}>Échap pour revenir à la sélection.</p>
    </aside>
  )
}
