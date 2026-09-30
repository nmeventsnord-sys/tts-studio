import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Hero } from '../components/Hero'
import { Help } from '../components/Help'
import { CATEGORIES, STYLES, fold, formatCount, loadThemes, type Theme } from '../lib/themes'

/** Écran 2 : galerie des thèmes (table themes). Filtres gardés dans l'URL pour le retour arrière. */
export default function Galerie() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [themes, setThemes] = useState<Theme[] | null>(null)
  const [err, setErr] = useState('')

  const q = params.get('q') ?? ''
  const cat = params.get('cat') ?? 'mariage'
  const style = params.get('style') ?? ''

  useEffect(() => { loadThemes().then(setThemes, (e) => setErr(e.message)) }, [])

  const update = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v); else p.delete(k)
    if (k === 'cat') p.delete('style')
    setParams(p, { replace: true })
  }

  // Recherche sur nom, police, style, catégorie et slug, sans tenir compte des accents.
  const matching = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean)
    return (themes ?? []).filter((t) => {
      const hay = fold([t.name, t.font_name, t.style, t.category, t.slug].filter(Boolean).join(' '))
      return words.every((w) => hay.includes(w))
    })
  }, [themes, q])

  const inCat = useMemo(() => matching.filter((t) => t.category === cat), [matching, cat])
  // Recherche sans résultat ici mais ailleurs : on bascule sur la première catégorie qui en a.
  useEffect(() => {
    if (!q || inCat.length || !matching.length) return
    const other = CATEGORIES.find((c) => matching.some((t) => t.category === c.key))
    if (other) update('cat', other.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, inCat.length, matching])
  const shown = useMemo(() => (style ? inCat.filter((t) => t.style === style) : inCat), [inCat, style])
  const styleCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of inCat) if (t.style) m.set(t.style, (m.get(t.style) ?? 0) + 1)
    return m
  }, [inCat])
  const styles = [...STYLES.filter((s) => styleCounts.has(s)), ...[...styleCounts.keys()].filter((s) => !(STYLES as readonly string[]).includes(s))]

  const open = (t: Theme) => nav(`/formats/${t.slug ?? t.id}`)

  return (
    <section>
      <Hero
        title="Choisis ton thème"
        sub="Les textes sont déjà en place : tu n'as plus qu'à mettre tes prénoms."
        right={<button className="back" onClick={() => nav('/')}>← Retour au choix du parcours</button>}
      />
      <div className="toolbar">
        <div className="toolbar-in">
          <div className="row">
            <div className="search">
              <span>🔍</span>
              <input
                placeholder="Rechercher un thème (ex : eucalyptus, or, noir…)"
                value={q}
                onChange={(e) => update('q', e.target.value)}
                aria-label="Rechercher un thème"
              />
            </div>
            <div className="chips">
              {CATEGORIES.map((c) => (
                <button key={c.key} className={'chip' + (cat === c.key ? ' on' : '')} onClick={() => update('cat', c.key)}>
                  {c.emoji} {c.label} <b>{matching.filter((t) => t.category === c.key).length}</b>
                </button>
              ))}
            </div>
          </div>
          {styles.length > 0 && (
            <div className="chips">
              <button className={'chip sm' + (!style ? ' on' : '')} onClick={() => update('style', '')}>Tous les styles</button>
              {styles.map((s) => (
                <button key={s} className={'chip sm' + (style === s ? ' on' : '')} onClick={() => update('style', s)}>{s}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="wrap">
        {err && <div className="err">{err}</div>}
        {!themes && !err && <div className="spinner" />}
        {themes && shown.length === 0 && (
          <div className="soon">
            Aucun thème ne correspond{q && <> à « <b>{q}</b> »</>} dans cette catégorie.
            {q && <p style={{ marginTop: 12 }}><button className="linkbtn" onClick={() => update('q', '')}>Effacer la recherche</button></p>}
          </div>
        )}
        <div className="grid">
          {shown.map((t) => (
            <article className="card" key={t.id}>
              <div className="thumb" onClick={() => open(t)}>
                {t.preview_url ? <img src={t.preview_url} alt={`Aperçu du thème ${t.name}`} loading="lazy" decoding="async" /> : <span className="meta">Aperçu indisponible</span>}
                <span className="badge">{t.style ?? CATEGORIES.find((c) => c.key === t.category)?.label ?? t.category}</span>
                {!!t.digits && Object.keys(t.digits as object).length > 0 && <span className="badge" style={{ left: 'auto', right: 10 }}>🔢 Chiffres</span>}
              </div>
              <div className="body">
                <div className="name">{t.name}</div>
                <div className="meta">
                  {formatCount(t)} format{formatCount(t) > 1 ? 's' : ''}
                  {t.font_name && <> · police <em>{t.font_name}</em></>}
                </div>
                <button className="go" onClick={() => open(t)} disabled={!formatCount(t)}>PERSONNALISER →</button>
              </div>
            </article>
          ))}
        </div>
      </div>
      <Help />
    </section>
  )
}
