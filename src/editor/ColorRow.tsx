const norm = (c: string) => c.trim().toLowerCase()

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }

/** Pastilles de couleur + « Autre » (sélecteur natif) + pipette quand le navigateur la propose. */
export function ColorRow({ value, palette, onChange }: { value: string; palette: string[]; onChange: (c: string) => void }) {
  const Eye = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'
  return (
    <div className="pr">
      {palette.map((c) => (
        <button key={c} className={'sw' + (norm(c) === norm(value) ? ' on' : '')} style={{ background: c }} aria-label={`Couleur ${c}`} onClick={() => onChange(c)} />
      ))}
      <label className="pb swin" title="Choisir une autre couleur">
        + Autre
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} />
      </label>
      {Eye && (
        <button className="pb" title="Prendre une couleur à l'écran" onClick={async () => {
          try { onChange((await new Eye().open()).sRGBHex) } catch { /* annulé */ }
        }}>💧</button>
      )}
    </div>
  )
}
