import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { IText } from 'fabric'
import { StudioEditor } from '../editor/engine'
import { ContextBar } from '../editor/ContextBar'
import { Panel } from '../editor/Panel'
import { Tutorial, type TutoStep } from '../editor/Tutorial'
import { FREE_FORMATS, THEME_FORMATS, defText, readInfo, type FreeFormatKey } from '../data/formats'
import { loadLibrary, type LibraryFont } from '../data/fontLibrary'
import { loadFont, loadFonts } from '../lib/fonts'
import { getTheme, type DefText, type FormatKey, type Theme, type ThemeFont } from '../lib/themes'
import '../styles/editor.css'

const BASE_PALETTE = ['#1a1410', '#ffffff', '#C9A84C', '#d85a30', '#3a5a8c', '#4f6b45']
const googleFont = (name: string): ThemeFont => ({ name, source: 'google', url: `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}&display=swap` })

type Spec = { w: number; h: number; bookmark: boolean; title: string; src?: string; def?: DefText[] }

/** Écran 4 : éditeur. */
export default function Editor() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const themeKey = params.get('theme')
  const fmtKey = params.get('format') ?? ''
  const libre = params.get('libre') as FreeFormatKey | null

  const hostRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<Theme | null | undefined>(libre ? null : undefined)
  const [ed, setEd] = useState<StudioEditor | null>(null)
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const [error, setError] = useState('')
  const [fly, setFly] = useState<'text' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [tuto, setTuto] = useState(false)
  const [lib, setLib] = useState<LibraryFont[]>([])
  const toastTimer = useRef(0)

  const say = useCallback((html: string) => {
    setToast(html)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => {
    if (libre || !themeKey) return
    getTheme(themeKey).then((t) => setTheme(t ?? null), (e) => setError(e.message))
  }, [themeKey, libre])
  useEffect(() => { loadLibrary().then(setLib) }, [])

  const spec = useMemo<Spec | null>(() => {
    if (libre) {
      const f = FREE_FORMATS[libre]
      return f ? { w: f.w, h: f.h, bookmark: 'bookmark' in f, title: f.title } : null
    }
    const f = theme?.fmts?.[fmtKey as FormatKey]
    if (!theme || !f) return null
    const meta = THEME_FORMATS[fmtKey as FormatKey]
    return { w: f.w, h: f.h, bookmark: !!meta?.bookmark, title: meta?.title ?? f.lbl ?? fmtKey, src: f.src, def: f.def }
  }, [libre, theme, fmtKey])

  const themeFonts = useMemo<ThemeFont[]>(() => {
    // Dédoublonnage par nom (certains thèmes listent deux fois la même police).
    const list = [...new Map((theme?.fonts ?? []).filter((f) => !/royalty|variable/i.test(f.name)).map((f) => [f.name.toLowerCase(), f])).values()]
    if (theme?.font_name && !list.some((f) => f.name === theme.font_name)) list.unshift(googleFont(theme.font_name))
    return list
  }, [theme])

  const palette = useMemo(() => {
    const fromTheme = (spec?.def ?? []).map((d) => d.c).filter(Boolean)
    return [...new Set([...fromTheme, ...BASE_PALETTE].map((c) => c.toLowerCase()))].slice(0, 8)
  }, [spec])

  // Création du moteur (un <canvas> neuf à chaque montage : compatible avec le double montage de React).
  useEffect(() => {
    const host = hostRef.current
    if (!spec || !host) return
    const box = document.createElement('div')
    box.style.cssText = 'position:absolute;inset:0'
    const el = document.createElement('canvas')
    box.appendChild(el)
    host.prepend(box)
    const e = new StudioEditor(el, host, { w: spec.w, h: spec.h, bookmark: spec.bookmark })
    const off = e.on(rerender)
    if (import.meta.env.DEV) (window as unknown as { __ed?: StudioEditor }).__ed = e
    let alive = true

    ;(async () => {
      try {
        // Les polices d'abord : sinon Fabric mesure les textes avec la police de repli.
        await loadFonts(themeFonts)
        if (!alive) return
        if (spec.src) await e.setBackgroundImage(spec.src, { kind: 'theme', src: spec.src })
        else e.setBackgroundColor('#ffffff')
        const info = readInfo()
        const mainFont = themeFonts[0]?.name
        ;(spec.def ?? []).forEach((d, i) => {
          let x = d.x
          if (spec.bookmark) {
            // Les textes des marque-pages sont posés sur la bande de gauche ; la droite est la copie.
            if (x > 0.6) return
            if (x >= 0.4) x = x / 2
          }
          e.addText({
            text: defText(d.t, i, info), x: x * spec.w, y: d.y * spec.h, size: d.sz, color: d.c,
            font: d.f ?? mainFont, bold: d.b, italic: d.i, align: d.al, spacing: d.ls, role: i === 0 ? 'names' : 'date',
          }, false)
        })
        e.resetHistory()
        if (!alive) return
        setEd(e)
        if (!localStorage.getItem(`tts-tuto-${libre ? 'libre' : 'theme'}`)) setTimeout(() => alive && setTuto(true), 500)
      } catch (err) {
        console.error(err)
        if (alive) setError("Le template n'a pas pu être chargé. Vérifie ta connexion puis recharge la page.")
      }
    })()

    return () => {
      alive = false
      off()
      setEd(null)
      e.dispose()
      box.remove()
    }
  }, [spec, themeFonts, libre])

  // Avertit avant de quitter avec des changements non sauvegardés.
  useEffect(() => {
    const h = (ev: BeforeUnloadEvent) => { if (ed?.dirty) ev.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [ed])

  const allFonts = useMemo(() => {
    const seen = new Set(themeFonts.map((f) => f.name))
    return [...themeFonts, ...lib.filter((f) => !seen.has(f.name))]
  }, [themeFonts, lib])

  const applyFont = useCallback(async (f: ThemeFont) => {
    const t = ed?.active
    if (!ed || !(t instanceof IText)) return
    await loadFont(f)
    ed.update(t, { fontFamily: f.name })
  }, [ed])

  const addText = useCallback((kind: 'title' | 'subtitle' | 'body') => {
    if (!ed) return
    const a = ed.area
    const aw = a.right - a.left
    const conf = {
      title: { text: 'Votre titre', size: aw * 0.1, font: themeFonts[0]?.name },
      subtitle: { text: 'Votre sous-titre', size: aw * 0.055, font: themeFonts[1]?.name ?? themeFonts[0]?.name },
      body: { text: 'Votre texte', size: aw * 0.04, font: 'Poppins' },
    }[kind]
    const n = ed.objects.filter((o) => o instanceof IText).length
    ed.addText({ ...conf, x: (a.left + a.right) / 2, y: ed.h * 0.4 + (n % 5) * ed.h * 0.05, color: palette[0] })
    setFly(null)
    ed.record(true)
  }, [ed, themeFonts, palette])

  const soon = (what: string, step: number) => say(`${what} : arrive à l'<b>étape ${step}</b>`)

  const closeTuto = useCallback(() => {
    setTuto(false)
    localStorage.setItem(`tts-tuto-${libre ? 'libre' : 'theme'}`, '1')
  }, [libre])

  const tutoSteps = useMemo<TutoStep[]>(() => {
    const byId = (id: string) => () => document.querySelector(`[data-tuto="${id}"]`)?.getBoundingClientRect() ?? null
    const names = () => ed?.objects.find((o) => o.role === 'names') ?? ed?.objects.find((o) => o instanceof IText)
    const namesRect = () => {
      const o = names()
      if (!ed || !o || !hostRef.current) return null
      const r = ed.screenRect(o)
      const h = hostRef.current.getBoundingClientRect()
      return new DOMRect(h.left + r.left, h.top + r.top, r.right - r.left, r.bottom - r.top)
    }
    const common: TutoStep[] = [
      { title: 'Ajoute tes prises de vue', text: 'Le bouton 📷 pose un cadre numéroté là où la borne mettra tes photos.', anchor: byId('zone'), side: 'right' },
      { title: 'Envoie quand tout est prêt', text: 'Ton design part dans ton dossier grâce à ton email. Tu reçois un PDF récap.', anchor: byId('send'), side: 'below' },
    ]
    if (libre || !names()) {
      return [
        { title: 'Ajoute tes textes', text: 'Titre, sous-titre ou texte : choisis, puis tape directement sur la page.', anchor: byId('text'), side: 'right' },
        { title: 'Choisis ton fond', text: 'Unis, dégradés, bohème, fête, textures : tout est prêt à imprimer.', anchor: byId('bg'), side: 'right' },
        ...common,
      ]
    }
    return [
      { title: 'Modifie les textes', text: 'Double-clique sur tes prénoms : ils sont déjà dans la bonne police, il suffit de les remplacer.', anchor: namesRect, side: 'right' },
      {
        title: 'La barre suit ta sélection', text: 'Police, taille, couleur, gras : tout est juste au-dessus de ce que tu modifies.',
        before: () => { const o = names(); if (o && ed) { ed.canvas.setActiveObject(o); ed.canvas.requestRenderAll(); rerender() } },
        anchor: () => document.querySelector('.ctx')?.getBoundingClientRect() ?? null, side: 'right',
      },
      ...common,
    ]
  }, [ed, libre])

  const back = () => nav(libre ? '/formats/libre' : `/formats/${themeKey}`)
  const title = libre ? 'Création libre' : theme?.name ?? '…'

  if (!libre && theme === null) {
    return <div className="wrap"><div className="soon">Ce thème ou ce format n'existe plus. <button className="linkbtn" onClick={() => nav('/themes')}>Voir les thèmes</button></div></div>
  }

  return (
    <section className="ed">
      <div className="ed-top">
        <button className="ib" onClick={back}>← Formats</button>
        <div className="t"><b>{title}</b> · {spec?.title ?? ''} · <span>{ed?.dirty ? 'modifications non sauvegardées' : 'aucune modification'}</span></div>
        <button className="ib" disabled={!ed?.canUndo} onClick={() => ed?.undo()} title="Annuler (Ctrl+Z)">↶ <span className="hide-sm">Annuler</span></button>
        <button className="ib" disabled={!ed?.canRedo} onClick={() => ed?.redo()} title="Refaire (Ctrl+Y)">↷ <span className="hide-sm">Refaire</span></button>
        <button className="ib sq" onClick={() => setTuto(true)} title="Revoir le tutoriel" aria-label="Revoir le tutoriel">?</button>
        <button className="ib" onClick={() => soon('Sauvegarde des projets', 7)}>💾 <span className="hide-sm">Sauvegarder</span></button>
        <button className="ib gold" data-tuto="send" onClick={() => soon("L'envoi du projet", 8)}>Envoyer <span className="hide-sm">le projet terminé</span> →</button>
      </div>

      <div className="ed-body">
        <nav className="rail" aria-label="Outils">
          <button data-tuto="text" className={fly === 'text' ? 'on' : ''} onClick={() => setFly(fly === 'text' ? null : 'text')}><span>T</span>Texte<div className="tip">Ajouter du texte</div></button>
          {fly === 'text' && (
            <div className="flyout" style={{ top: 10 }}>
              <button onClick={() => addText('title')} style={{ fontSize: 20, fontFamily: `"${themeFonts[0]?.name ?? 'Poppins'}"` }}>Ajouter un titre</button>
              <button onClick={() => addText('subtitle')} style={{ fontSize: 15 }}>Ajouter un sous-titre</button>
              <button onClick={() => addText('body')} style={{ fontSize: 12 }}>Ajouter du texte</button>
            </div>
          )}
          <button onClick={() => soon("L'import d'images", 5)}><span>🖼</span>Images<div className="tip">Importer une image ou un logo</div></button>
          <button data-tuto="zone" onClick={() => soon('Les prises de vue', 5)}><span>📷</span>Prise de vue<div className="tip">Ajouter une prise de vue</div></button>
          <button data-tuto="bg" onClick={() => soon('Les fonds', 6)}><span>🎨</span>Fonds<div className="tip">Changer le fond</div></button>
          <button onClick={() => soon('La main magique', 6)}><span>✋</span>Main<div className="tip">Déplacer un élément du design</div></button>
          <button onClick={() => soon('La baguette magique', 6)}><span>🪄</span>Baguette<div className="tip">Détourer par clic</div></button>
          <button onClick={() => soon('La gomme', 6)}><span>🧽</span>Gomme<div className="tip">Effacer une zone</div></button>
        </nav>

        <div className="stage" ref={hostRef} onMouseDown={() => fly && setFly(null)}>
          {!ed && <div className="ed-loading">{error ? <div className="err" style={{ maxWidth: 420 }}>{error}</div> : <><div className="spinner" style={{ margin: 0 }} />Préparation du template…</>}</div>}
          {toast && <div className="stoast" dangerouslySetInnerHTML={{ __html: toast }} />}
          {ed && <ContextBar ed={ed} fonts={allFonts} palette={palette} onFont={applyFont} />}
          {ed && (
            <div className="zoomctl">
              <button onClick={() => ed.zoomBy(-1)} disabled={ed.zoomPercent <= 100} aria-label="Dézoomer">−</button>
              <span>{ed.zoomPercent} %</span>
              <button onClick={() => ed.zoomBy(1)} disabled={ed.zoomPercent >= 400} aria-label="Zoomer">+</button>
              <button onClick={() => ed.zoomFit()} title="Ajuster à l'écran" aria-label="Ajuster à l'écran">⤢</button>
            </div>
          )}
          <button className="help" onClick={() => soon("« Besoin d'aide ? »", 9)}>? Besoin d'aide</button>
        </div>

        {ed ? <Panel ed={ed} themeFonts={themeFonts} palette={palette} onFont={applyFont} onAddText={() => addText('body')} /> : <aside className="panel" />}
      </div>
      {tuto && ed && <Tutorial steps={tutoSteps} onClose={closeTuto} />}
    </section>
  )
}
