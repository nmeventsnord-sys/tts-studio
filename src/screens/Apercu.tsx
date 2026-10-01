import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Hero } from '../components/Hero'
import { TemplatePreview } from '../components/TemplatePreview'
import { themeFormats } from '../data/formats'
import { loadFonts } from '../lib/fonts'
import { fold, loadThemes, type Theme } from '../lib/themes'

/**
 * Page de contrôle (équipe) : tous les formats de chaque thème, rendu fidèle (polices, photos d'exemple,
 * textes). ?local=1 lit la simulation du script d'ingestion (public/__apercu/themes.json) au lieu de la base.
 */
export default function Apercu() {
  const [params] = useSearchParams()
  const local = params.get('local') === '1'
  const [themes, setThemes] = useState<Theme[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    const load = local ? fetch('/__apercu/themes.json').then((r) => { if (!r.ok) throw new Error('Lance d’abord : pnpm ingest:themes -- --dry-run --ai --apercu'); return r.json() }) : loadThemes()
    load.then(setThemes, (e) => setErr((e as Error).message))
  }, [local])

  const shown = useMemo(() => (themes ?? []).filter((t) => !q || fold(t.name).includes(fold(q))), [themes, q])

  return (
    <section>
      <Hero title={`Contrôle des thèmes${themes ? ` — ${shown.length}` : ''}`} sub={local ? 'Simulation du script d’ingestion (rien n’est encore en ligne).' : 'Thèmes en base.'} />
      <div className="wrap">
        <div className="search" style={{ maxWidth: 420, marginBottom: 18 }}><span>🔍</span><input placeholder="Filtrer…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {err && <div className="err">{err}</div>}
        {!themes && !err && <div className="spinner" />}
        {shown.map((t) => <ThemeRow key={t.id ?? t.slug} theme={t} />)}
      </div>
    </section>
  )
}

function ThemeRow({ theme }: { theme: Theme }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { loadFonts(theme.fonts).then(() => setReady(true)) }, [theme])
  return (
    <div className="aprow">
      <h3>{theme.name} <small>{theme.category} · {theme.style ?? '—'} · {(theme.fonts ?? []).map((f) => f.name).join(', ') || 'aucune police'}</small></h3>
      <div className="aplist">
        {themeFormats(theme).map(([k, f, meta]) => (
          <figure key={k}>
            <TemplatePreview fmt={f} font={theme.font_name} info={{ names: '', date: '' }} category={theme.category} bookmark={meta.bookmark} width={f.w > f.h ? 300 : 200} style={{ opacity: ready ? 1 : 0.4 }} />
            <figcaption>{meta.title}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
