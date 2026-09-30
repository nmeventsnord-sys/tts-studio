import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { IText } from 'fabric'
import { StudioEditor, ZONE_MAX } from '../editor/engine'
import { getAssetBlob, putAsset, putEditedAsset } from '../editor/assets'
import { BackgroundPicker } from '../editor/BackgroundPicker'
import { removeBackgroundAI } from '../editor/cutout'
import { FabricImage } from 'fabric'
import type { Tool, ToolResult } from '../editor/engine'
import { ContextBar } from '../editor/ContextBar'
import { Panel } from '../editor/Panel'
import { Tutorial, type TutoStep } from '../editor/Tutorial'
import { FREE_FORMATS, THEME_FORMATS, defText, readInfo, type FreeFormatKey } from '../data/formats'
import { loadLibrary, type LibraryFont } from '../data/fontLibrary'
import { loadFont, loadFonts } from '../lib/fonts'
import { getTheme, type DefText, type FormatKey, type Theme, type ThemeFont } from '../lib/themes'
import { useSession } from '../lib/session'
import { MasterStore, convertV1, projectStore, readProject, type ProjectData, type ProjectMeta, type ProjectRow } from '../lib/projects'
import { Help } from '../components/Help'
import { useProject } from '../editor/useProject'
import { ProjectModals } from '../editor/ProjectModals'
import { SendModal } from '../editor/SendModal'
import { renderPlan, renderPrint, toBlob } from '../editor/export'
import { uploadBlobs } from '../lib/upload'
import { api } from '../lib/api'
import { LAST_SEND_KEY, type LastSend } from './Envoye'
import '../styles/editor.css'

const BASE_PALETTE = ['#1a1410', '#ffffff', '#C9A84C', '#d85a30', '#3a5a8c', '#4f6b45']
const googleFont = (name: string): ThemeFont => ({ name, source: 'google', url: `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}&display=swap` })

type Spec = { w: number; h: number; bookmark: boolean; title: string; src?: string; def?: DefText[] }

/** Écran 4 : éditeur. */
export default function Editor() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const identity = useSession().identity!
  const masterId = params.get('master')
  const projectId = masterId ?? params.get('projet')
  const master = useMemo(() => (masterId && identity.kind === 'user' ? new MasterStore(masterId) : null), [masterId, identity])

  // Projet rouvert (?projet=) : le thème et le format viennent du projet enregistré.
  type Loaded = { row: ProjectRow; data: ProjectData | null; legacy: ReturnType<typeof readProject>['legacy'] }
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(projectId ? undefined : null)
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    if (!projectId) { setLoaded(null); return }
    if (masterId && !master) { setError('Le mode Time To Smile demande une connexion avec ton compte Zing.'); return }
    let ok = true
    ;(master ?? projectStore(identity)).get(projectId).then(
      (row) => { if (!ok) return; if (!row) { setError("Ce projet n'existe plus."); return } setLoaded({ row, ...readProject(row) }) },
      (e) => ok && setError((e as Error).message),
    )
    return () => { ok = false }
  }, [projectId, identity, reloadKey, master, masterId])

  const meta0 = loaded?.data?.meta
  const themeKey = loaded ? meta0?.theme ?? (loaded.row.parcours === 'libre' ? null : loaded.row.theme_id) : params.get('theme')
  const libre = (loaded ? meta0?.libre ?? (loaded.row.parcours === 'libre' ? loaded.row.format_key : null) : params.get('libre')) as FreeFormatKey | null
  const fmtKey = (loaded ? meta0?.format ?? loaded.row.format_key : params.get('format')) ?? ''

  const hostRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<Theme | null | undefined>(undefined)
  const [ed, setEd] = useState<StudioEditor | null>(null)
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const [error, setError] = useState('')
  const [fly, setFly] = useState<'text' | 'image' | 'bg' | 'digits' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [tuto, setTuto] = useState(false)
  const [sending, setSending] = useState(false)
  const [lib, setLib] = useState<LibraryFont[]>([])
  const toastTimer = useRef(0)

  /** Message dans le canvas ; ms = 0 le laisse affiché (progression). */
  const say = useCallback((html: string, ms = 2800) => {
    setToast(html)
    clearTimeout(toastTimer.current)
    if (ms) toastTimer.current = window.setTimeout(() => setToast(null), ms)
  }, [])

  useEffect(() => {
    if (libre) { setTheme(null); return }
    if (!themeKey) return
    getTheme(themeKey).then((t) => setTheme(t ?? null), (e) => setError(e.message))
  }, [themeKey, libre])
  useEffect(() => { loadLibrary().then(setLib) }, [])

  const spec = useMemo<Spec | null>(() => {
    if (libre) {
      const f = FREE_FORMATS[libre]
      return f ? { w: f.w, h: f.h, bookmark: 'bookmark' in f, title: f.title } : null
    }
    if (loaded === undefined) return null
    const f = theme?.fmts?.[fmtKey as FormatKey]
    if (!theme || !f) return null
    const meta = THEME_FORMATS[fmtKey as FormatKey]
    return { w: f.w, h: f.h, bookmark: !!meta?.bookmark, title: meta?.title ?? f.lbl ?? fmtKey, src: f.src, def: f.def }
  }, [libre, theme, fmtKey, loaded])

  const themeFonts = useMemo<ThemeFont[]>(() => {
    // Dédoublonnage par nom (certains thèmes listent deux fois la même police).
    const list = [...new Map((theme?.fonts ?? []).filter((f) => !/royalty|variable/i.test(f.name)).map((f) => [f.name.toLowerCase(), f])).values()]
    if (theme?.font_name && !list.some((f) => f.name === theme.font_name)) list.unshift(googleFont(theme.font_name))
    return list
  }, [theme])

  /** Chiffres 0-9 du thème (badge « Chiffres » de la galerie). */
  const digits = useMemo(() => Object.entries((theme?.digits ?? {}) as Record<string, string>).filter(([k, v]) => /^\d$/.test(k) && v).sort(), [theme])

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
        const saved = loaded?.data?.doc ?? (loaded?.legacy ? convertV1(loaded.legacy, spec) : null)
        if (saved) {
          // Projet rouvert : on recharge d'abord TOUTES ses polices (bug de l'existant : export en police de repli).
          const used = new Set(saved.objects.map((o) => o.fontFamily as string | undefined).filter(Boolean) as string[])
          const lib = await loadLibrary()
          await Promise.all([...used].map((n) => {
            const f = themeFonts.find((x) => x.name === n) ?? lib.find((x) => x.name === n)
            return f ? loadFont(f) : null
          }))
          await e.loadJSON(saved)
          if (!e.background) await e.applyBackground(spec.src ? { kind: 'theme', src: spec.src } : { kind: 'color', color: '#ffffff' })
          e.resetHistory()
          if (!alive) return
          setEd(e)
          return
        }
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
  }, [spec, themeFonts, libre, loaded])

  const title = libre ? 'Création libre' : theme?.name ?? '…'
  const defaultName = `${title} — ${spec?.title ?? ''}`
  const meta = useMemo<ProjectMeta | null>(() => (spec ? {
    theme: theme?.slug ?? theme?.id, themeName: theme?.name, format: libre ?? fmtKey, libre: libre ?? undefined, info: readInfo(),
  } : null), [spec, theme, libre, fmtKey])
  const project = useProject({ ed, identity, meta, themeId: theme?.id ?? null, defaultName, initial: loaded?.row ?? null, say, storeOverride: master })

  /** Mode master : PNG d'impression téléchargé directement (et automatiquement avec &export=png). */
  const downloadPrint = useCallback(async () => {
    if (!ed) return
    const blob = await toBlob(renderPrint(ed), 'image/png')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(loaded?.row.name ?? 'template').replace(/[^\w-]+/g, '-')}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }, [ed, loaded])
  const autoExport = useRef(false)
  useEffect(() => {
    if (master && ed && params.get('export') === 'png' && !autoExport.current) { autoExport.current = true; downloadPrint() }
  }, [master, ed, params, downloadPrint])

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

  /** Import d'images (bouton, collage, glisser-déposer) : stockées hors du projet, voir assets.ts. */
  const importFiles = useCallback(async (files: File[]) => {
    if (!ed) return
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) { say("Ce fichier n'est pas une image (JPG, PNG, WEBP, SVG…)"); return }
    setFly(null)
    for (const f of imgs) {
      try {
        const { key, url } = await putAsset(f)
        await ed.addImage(url, key)
      } catch (err) {
        console.error(err)
        say(`Impossible d'ajouter <b>${f.name.replace(/</g, '')}</b>`)
      }
    }
    if (imgs.length) say('Image ajoutée · déplace-la, redimensionne-la par les coins')
  }, [ed, say])

  // Ctrl+V : image du presse-papiers, sinon l'objet copié dans l'éditeur.
  useEffect(() => {
    if (!ed) return
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement
      if (/^(INPUT|TEXTAREA)$/.test(el?.tagName ?? '') || el?.isContentEditable || (ed.active as IText | undefined)?.isEditing) return
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      e.preventDefault()
      if (files.length) importFiles(files)
      else ed.paste()
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [ed, importFiles])

  const addZone = useCallback(() => {
    if (!ed) return
    const n = ed.addZone()
    if (n === null) say(`${ZONE_MAX} prises de vue maximum`)
    else if (n === 1) say('Zone 1 : dimensionne-la librement. Les suivantes garderont <b>la même proportion</b>.')
    else say(`Zone ${n} ajoutée · proportions verrouillées`)
  }, [ed, say])

  // Retour des outils (main magique, baguette, gomme)
  useEffect(() => {
    if (!ed) return
    const msgs: Partial<Record<`${Tool}:${ToolResult}`, string>> = {
      'hand:ok': 'Élément détaché : <b>déplace-le</b>, agrandis-le ou supprime-le',
      'hand:empty': 'Rien à détacher ici : clique <b>sur un motif</b> du design. Si le motif se confond avec le fond (photo, paillettes), baisse la tolérance.',
      'hand:toobig': 'Ce motif couvre trop de surface : baisse la tolérance ou clique sur un élément plus isolé',
      'hand:nobg': 'Il n\u2019y a pas de fond à modifier',
      'wand:noimage': 'Clique sur une <b>image importée</b>. Pour le fond du thème, utilise la main magique.',
      'eraser:noimage': 'Commence sur une <b>image importée</b>',
      'wand:busy': 'Un instant, traitement en cours…',
      'hand:busy': 'Un instant, traitement en cours…',
    }
    ed.onToolResult = (tool, r) => { const m = msgs[`${tool}:${r}`]; if (m) say(m, 3600) }
    return () => { ed.onToolResult = undefined }
  }, [ed, say])

  const toggleTool = (t: Tool) => { if (!ed) return; setFly(null); ed.setTool(ed.tool === t ? 'select' : t) }

  /** Détourage IA de l'image sélectionnée (modèle chargé à la première utilisation). */
  const cutout = useCallback(async () => {
    const img = ed?.active
    if (!ed || !(img instanceof FabricImage)) return
    const key = (img as { srcKey?: string }).srcKey
    ed.busy = true
    ed.touch()
    say('✨ Détourage en préparation…', 0)
    try {
      const src = (key && (await getAssetBlob(key))) || (await (await fetch(img.getSrc())).blob())
      const out = await removeBackgroundAI(src, (pct) => say(`✨ Téléchargement du modèle IA (une seule fois) : <b>${pct} %</b>`, 0))
      say('✨ Détourage en cours…', 0)
      const { key: k2, url } = await putEditedAsset(out)
      await ed.replaceImage(img, url, k2)
      say('Fond supprimé ✨ · Ctrl+Z pour revenir en arrière')
    } catch (err) {
      console.error(err)
      say("Le détourage n'a pas abouti. Essaie la baguette magique ou la gomme.", 4000)
    } finally {
      ed.busy = false
      ed.touch()
    }
  }, [ed, say])

  /** Envoi à Zing : PNG natif (trous transparents) + plan annoté, déposés dans Storage puis relayés. */
  const sendNow = useCallback(async () => {
    if (!ed || !spec) return
    if (project.proj && ed.dirty) await project.save({ auto: true })
    const [png, plan] = await Promise.all([toBlob(renderPrint(ed), 'image/png'), toBlob(renderPlan(ed), 'image/jpeg', 0.82)])
    const kp = crypto.randomUUID()
    const ka = crypto.randomUUID()
    const urls = await uploadBlobs([{ key: kp, blob: png, kind: 'export' }, { key: ka, blob: plan, kind: 'export' }])
    const template = libre ? `Création libre — ${spec.title}` : theme?.name ?? 'Template'
    await api('send-template', {
      email: identity.email, prenom: identity.prenom, nom: identity.nom, template, format: spec.title,
      png_url: urls[kp], annotated_url: urls[ka],
    })
    if (project.proj) await project.store.markSent(project.proj.id).catch(() => {})
    const last: LastSend = {
      email: identity.email, prenom: identity.prenom, nom: identity.nom, template, format: spec.title, zones: ed.zones.length,
      planDataUrl: renderPlan(ed, 1400).toDataURL('image/jpeg', 0.85),
      back: project.proj ? `/editeur?projet=${project.proj.id}` : location.pathname + location.search,
    }
    sessionStorage.setItem(LAST_SEND_KEY, JSON.stringify(last))
    ed.dirty = false
    nav('/envoye')
  }, [ed, spec, project, libre, theme, identity, nav])


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

  const back = () => nav(libre ? '/formats/libre' : `/formats/${theme?.slug ?? themeKey}`)

  if (!libre && theme === null) {
    return <div className="wrap"><div className="soon">Ce thème ou ce format n'existe plus. <button className="linkbtn" onClick={() => nav('/themes')}>Voir les thèmes</button></div></div>
  }

  return (
    <section className="ed">
      <div className="ed-top">
        <button className="ib" onClick={back}>← Formats</button>
        {master && <span className="mastertag" title={master.client?.email}>MODE TIME TO SMILE{master.client ? ` · ${master.client.prenom || master.client.email}` : ''}</span>}
        <div className="t"><b>{title}</b> · {spec?.title ?? ''} · <span>{project.status}</span></div>
        <button className="ib" disabled={!ed?.canUndo} onClick={() => ed?.undo()} title="Annuler (Ctrl+Z)">↶ <span className="hide-sm">Annuler</span></button>
        <button className="ib" disabled={!ed?.canRedo} onClick={() => ed?.redo()} title="Refaire (Ctrl+Y)">↷ <span className="hide-sm">Refaire</span></button>
        <button className="ib sq" onClick={() => setTuto(true)} title="Revoir le tutoriel" aria-label="Revoir le tutoriel">?</button>
        <button className="ib" disabled={!ed || project.saving} onClick={() => project.save()}>💾 <span className="hide-sm">Sauvegarder</span></button>
        {master ? (
          <button className="ib gold" disabled={!ed} onClick={downloadPrint}>⬇ PNG d'impression</button>
        ) : (
        <button className="ib gold" data-tuto="send" disabled={!ed} onClick={() => { if (ed) { ed.setTool('select'); setSending(true) } }}>Envoyer <span className="hide-sm">le projet terminé</span> →</button>
        )}
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
          <button className={fly === 'image' ? 'on' : ''} onClick={() => setFly(fly === 'image' ? null : 'image')}><span>🖼</span>Images<div className="tip">Importer une image ou un logo</div></button>
          {fly === 'image' && (
            <div className="flyout" style={{ top: 72 }}>
              <button onClick={() => fileRef.current?.click()}>📁 Importer une image ou un logo</button>
              <p className="hint" style={{ padding: '4px 12px 8px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>Astuce : colle une image (Ctrl+V) ou glisse-la directement sur la page.</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { importFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
          {digits.length > 0 && (
            <button className={fly === 'digits' ? 'on' : ''} onClick={() => setFly(fly === 'digits' ? null : 'digits')}><span>🔢</span>Chiffres<div className="tip">Ajouter un chiffre du thème</div></button>
          )}
          {fly === 'digits' && (
            <div className="flyout digits" style={{ top: 130 }}>
              {digits.map(([d, url]) => (
                <button key={d} title={`Ajouter le ${d}`} onClick={() => { ed?.addImage(url, undefined, 'digit'); setFly(null) }}><img src={url} alt={d} /></button>
              ))}
            </div>
          )}
          <button data-tuto="zone" onClick={addZone}><span>📷</span>Prise de vue<div className="tip">Ajouter une prise de vue</div></button>
          <button data-tuto="bg" className={fly === 'bg' ? 'on' : ''} onClick={() => setFly(fly === 'bg' ? null : 'bg')}><span>🎨</span>Fonds<div className="tip">Changer le fond</div></button>
          {fly === 'bg' && ed && <BackgroundPicker ed={ed} themeSrc={spec?.src} onDone={(m) => say(m)} />}
          <button className={ed?.tool === 'hand' ? 'on' : ''} onClick={() => toggleTool('hand')}><span>✋</span>Main<div className="tip">Déplacer un élément du design</div></button>
          <button className={ed?.tool === 'wand' ? 'on' : ''} onClick={() => toggleTool('wand')}><span>🪄</span>Baguette<div className="tip">Détourer par clic</div></button>
          <button className={ed?.tool === 'eraser' ? 'on' : ''} onClick={() => toggleTool('eraser')}><span>🧽</span>Gomme<div className="tip">Effacer une zone</div></button>
        </nav>

        <div
          className="stage"
          ref={hostRef}
          onMouseDown={() => fly && setFly(null)}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}
          onDrop={(e) => { e.preventDefault(); importFiles([...e.dataTransfer.files]) }}
        >
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
          {!master && <Help variant="stage" project={project.proj ? { id: project.proj.id, name: project.proj.name ?? undefined } : undefined} />}
        </div>

        {ed ? <Panel ed={ed} themeFonts={themeFonts} palette={palette} onFont={applyFont} onAddText={() => addText('body')} onCutout={cutout} /> : <aside className="panel" />}
      </div>
      {tuto && ed && <Tutorial steps={tutoSteps} onClose={closeTuto} />}
      {sending && ed && (
        <SendModal ed={ed} identity={identity} hasThemeHoles={!!spec?.src} onCancel={() => setSending(false)} onConfirm={sendNow} />
      )}
      {project.modal && (
        <ProjectModals
          key={project.modal.kind}
          modal={project.modal}
          store={project.store}
          defaultName={project.proj?.name ?? defaultName}
          onClose={() => project.setModal(null)}
          onSave={(o) => project.save(o)}
          onReload={() => { const id = project.proj?.id; project.setModal(null); if (ed) ed.dirty = false; setLoaded(undefined); if (id) nav(`/editeur?projet=${id}`, { replace: true }); setReloadKey((k) => k + 1) }}
        />
      )}
    </section>
  )
}
