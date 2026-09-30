import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IText } from 'fabric'
import type { StudioEditor } from './engine'
import type { Identity } from '../lib/session'
import { ConflictError, LimitError, MAX_PROJECTS, projectStore, type ProjectMeta, type ProjectRow } from '../lib/projects'

export type ProjectModal =
  | { kind: 'name' }
  | { kind: 'limit'; projects: ProjectRow[]; name: string }
  | { kind: 'conflict'; current: ProjectRow | null }

const AUTOSAVE_MS = 60_000

/** Miniature JPEG 360 px (fond blanc sous les trous) pour « Mes projets ». */
export async function thumbnail(ed: StudioEditor): Promise<Blob> {
  const src = ed.renderNative({ multiplier: 360 / ed.w })
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(src, 0, 0)
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('miniature'))), 'image/jpeg', 0.72))
}

export function ago(t: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 45) return "à l'instant"
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  return h < 24 ? `il y a ${h} h` : `le ${new Date(t).toLocaleDateString('fr-FR')}`
}

/**
 * Sauvegarde des projets depuis l'éditeur : 3 max, sauvegarde auto toutes les minutes,
 * verrou optimiste sur updated_at (anti-écrasement), comptes et invités.
 */
export function useProject(opts: {
  ed: StudioEditor | null
  identity: Identity
  meta: ProjectMeta | null
  themeId: string | null
  defaultName: string
  initial: ProjectRow | null
  say: (html: string, ms?: number) => void
}) {
  const { ed, identity, meta, themeId, defaultName, initial, say } = opts
  const store = useMemo(() => projectStore(identity), [identity])
  const [proj, setProj] = useState<ProjectRow | null>(initial)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(initial ? Date.parse(initial.updated_at) : null)
  const [modal, setModal] = useState<ProjectModal | null>(null)
  const [, tick] = useState(0)
  const busy = useRef(false)

  useEffect(() => { setProj(initial); setSavedAt(initial ? Date.parse(initial.updated_at) : null) }, [initial])
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(id) }, [])

  const save = useCallback(async (o: { auto?: boolean; name?: string; replace?: string; force?: boolean; asCopy?: boolean } = {}) => {
    if (!ed || !meta || busy.current) return
    if (!proj && !o.name && !o.replace) { setModal({ kind: 'name' }); return }
    busy.current = true
    setSaving(true)
    const name = o.name ?? proj?.name ?? defaultName
    try {
      const input = { name, data: { v: 2 as const, meta, doc: ed.toJSON() }, themeId, thumb: await thumbnail(ed) }
      let row: ProjectRow
      if (o.replace) row = await store.update(o.replace, null, input)
      else if (!proj || o.asCopy) row = await store.create(o.asCopy ? { ...input, name: `${name} (copie)` } : input)
      else row = await store.update(proj.id, o.force ? null : proj.updated_at, input)
      setProj(row)
      setSavedAt(Date.now())
      setModal(null)
      ed.dirty = false
      ed.touch()
      window.history.replaceState(null, '', `/editeur?projet=${row.id}`)
      if (!o.auto) {
        const n = (await store.list()).length
        say(`Projet sauvegardé <b>(${n}/${MAX_PROJECTS})</b>${store.remote ? '' : ' sur cet appareil'}`)
      }
    } catch (e) {
      if (e instanceof LimitError) setModal({ kind: 'limit', projects: e.projects, name })
      else if (e instanceof ConflictError) setModal({ kind: 'conflict', current: e.current })
      else if (!o.auto) say((e as Error).message, 5000)
      else console.warn('Sauvegarde auto', e)
    } finally {
      busy.current = false
      setSaving(false)
    }
  }, [ed, meta, proj, defaultName, themeId, store, say])

  // Sauvegarde automatique (projet déjà créé, modifications en attente, pas pendant une saisie).
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const run = () => {
      if (!ed || !proj || !ed.dirty || modal || (ed.active as IText | undefined)?.isEditing) return
      saveRef.current({ auto: true })
    }
    const id = setInterval(run, AUTOSAVE_MS)
    const onHide = () => { if (document.visibilityState === 'hidden') run() }
    document.addEventListener('visibilitychange', onHide)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide) }
  }, [ed, proj, modal])

  const status = saving
    ? 'sauvegarde…'
    : !proj
      ? ed?.dirty ? 'pas encore sauvegardé' : 'nouveau projet'
      : ed?.dirty ? 'modifications non sauvegardées' : `sauvegardé ${savedAt ? ago(savedAt) : ''}`

  return { store, proj, setProj, saving, status, save, modal, setModal }
}
