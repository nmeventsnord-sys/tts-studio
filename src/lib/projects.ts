import { supabase } from './supabase'
import { ensureRemote, uploadBlobs } from './upload'
import type { Identity } from './session'
import type { DocJSON } from '../editor/engine'
import type { EventInfo, FreeFormatKey } from '../data/formats'

export const MAX_PROJECTS = 3

export type ProjectMeta = { theme?: string; themeName?: string; format: string; libre?: FreeFormatKey; info?: EventInfo }
export type ProjectData = { v: 2; meta: ProjectMeta; doc: DocJSON }
export type ProjectRow = {
  id: string
  name: string | null
  parcours: 'template' | 'libre' | string | null
  theme_id: string | null
  format_key: string | null
  preview_url: string | null
  status: string | null
  master_edited: boolean | null
  updated_at: string
  created_at: string
  sent_at: string | null
  canvas_json?: unknown
}
export type SaveInput = { name: string; data: ProjectData; themeId?: string | null; thumb?: Blob }

export class LimitError extends Error {
  constructor(public projects: ProjectRow[]) { super(`${MAX_PROJECTS} projets maximum`) }
}
export class ConflictError extends Error {
  constructor(public current: ProjectRow | null) { super(current ? 'Projet modifié ailleurs' : 'Projet supprimé') }
}

const LIST_COLS = 'id,name,parcours,theme_id,format_key,preview_url,status,master_edited,updated_at,created_at,sent_at'

export interface ProjectStore {
  readonly remote: boolean
  list(): Promise<ProjectRow[]>
  get(id: string): Promise<ProjectRow | null>
  create(input: SaveInput): Promise<ProjectRow>
  /** since = updated_at connu ; null = écraser sans vérifier */
  update(id: string, since: string | null, input: SaveInput): Promise<ProjectRow>
  rename(id: string, name: string): Promise<ProjectRow>
  duplicate(id: string): Promise<ProjectRow>
  remove(id: string): Promise<void>
  markSent(id: string): Promise<void>
}

/** Remplace les images locales (blob:) par leurs URL en ligne, en les envoyant si besoin. */
async function publishImages(doc: DocJSON): Promise<DocJSON> {
  const keys = doc.objects.map((o) => o.srcKey).filter(Boolean) as string[]
  if (doc.background?.kind === 'asset') keys.push(doc.background.key)
  if (!keys.length) return doc
  const urls = await ensureRemote(keys)
  return {
    ...doc,
    objects: doc.objects.map((o) => (o.srcKey && urls[String(o.srcKey)] ? { ...o, src: urls[String(o.srcKey)] } : o)),
    background: doc.background?.kind === 'asset' && urls[doc.background.key] ? { ...doc.background, src: urls[doc.background.key] } : doc.background,
  }
}

// ───────────── compte : table client_projects (RLS : user_id = auth.uid()) ─────────────
class RemoteStore implements ProjectStore {
  readonly remote = true
  constructor(private userId: string) {}

  async list() {
    const { data, error } = await supabase.from('client_projects').select(LIST_COLS).order('updated_at', { ascending: false })
    if (error) throw new Error('Impossible de charger tes projets : ' + error.message)
    return (data ?? []) as ProjectRow[]
  }

  async get(id: string) {
    const { data, error } = await supabase.from('client_projects').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data as ProjectRow | null
  }

  private async fields(id: string, input: SaveInput) {
    const doc = await publishImages(input.data.doc)
    const out: Record<string, unknown> = {
      name: input.name.slice(0, 120),
      parcours: input.data.meta.libre ? 'libre' : 'template',
      theme_id: input.themeId ?? null,
      format_key: input.data.meta.libre ?? input.data.meta.format,
      canvas_json: { ...input.data, doc },
    }
    if (input.thumb) {
      const up = await uploadBlobs([{ key: id, blob: input.thumb, kind: 'thumb' }])
      out.preview_url = `${up[id]}?v=${Date.now()}`
    }
    return out
  }

  async create(input: SaveInput) {
    const all = await this.list()
    if (all.length >= MAX_PROJECTS) throw new LimitError(all)
    const id = crypto.randomUUID()
    const { data, error } = await supabase
      .from('client_projects')
      .insert({ id, user_id: this.userId, status: 'draft', ...(await this.fields(id, input)) })
      .select(LIST_COLS)
      .single()
    if (error) {
      if (/TTS_LIMITE_PROJETS/.test(error.message)) throw new LimitError(await this.list())
      throw new Error("L'enregistrement a échoué : " + error.message)
    }
    return data as ProjectRow
  }

  async update(id: string, since: string | null, input: SaveInput) {
    let q = supabase.from('client_projects').update(await this.fields(id, input)).eq('id', id)
    if (since) q = q.eq('updated_at', since)
    const { data, error } = await q.select(LIST_COLS).maybeSingle()
    if (error) throw new Error("L'enregistrement a échoué : " + error.message)
    if (!data) throw new ConflictError(await this.get(id))
    return data as ProjectRow
  }

  async rename(id: string, name: string) {
    // renvoie la nouvelle date : l'éditeur ouvert ne verra pas de faux conflit (bug de l'existant)
    const { data, error } = await supabase.from('client_projects').update({ name: name.slice(0, 120) }).eq('id', id).select(LIST_COLS).single()
    if (error) throw new Error(error.message)
    return data as ProjectRow
  }

  async duplicate(id: string) {
    const src = await this.get(id)
    if (!src) throw new Error('Projet introuvable')
    const all = await this.list()
    if (all.length >= MAX_PROJECTS) throw new LimitError(all)
    const copy = crypto.randomUUID()
    const { data, error } = await supabase
      .from('client_projects')
      .insert({
        id: copy, user_id: this.userId, status: 'draft', name: `${src.name ?? 'Projet'} (copie)`,
        parcours: src.parcours, theme_id: src.theme_id, format_key: src.format_key, canvas_json: src.canvas_json,
        preview_url: src.preview_url, // même miniature : elle est remplacée à la 1re sauvegarde de la copie
      })
      .select(LIST_COLS)
      .single()
    if (error) throw new Error(error.message)
    return data as ProjectRow
  }

  async remove(id: string) {
    const { error } = await supabase.from('client_projects').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async markSent(id: string) {
    await supabase.from('client_projects').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id)
  }
}

// ───────────── invité : projets gardés sur cet appareil ─────────────
type LocalRow = ProjectRow & { canvas_json: ProjectData }

class LocalStore implements ProjectStore {
  readonly remote = false
  constructor(private email: string) {}
  private get key() { return `tts-studio-projects:${this.email}` }
  private read(): LocalRow[] { try { return JSON.parse(localStorage.getItem(this.key) || '[]') } catch { return [] } }
  private write(rows: LocalRow[]) {
    try { localStorage.setItem(this.key, JSON.stringify(rows)) }
    catch { throw new Error("L'espace de stockage de ce navigateur est plein : crée un compte pour sauvegarder en ligne.") }
  }
  private strip = ({ canvas_json: _c, ...r }: LocalRow): ProjectRow => r // eslint-disable-line @typescript-eslint/no-unused-vars
  private async thumb(b?: Blob) {
    if (!b) return null
    return new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(b) })
  }

  async list() { return this.read().sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(this.strip) }
  async get(id: string) { return this.read().find((r) => r.id === id) ?? null }

  async create(input: SaveInput) {
    const rows = this.read()
    if (rows.length >= MAX_PROJECTS) throw new LimitError(rows.map(this.strip))
    const now = new Date().toISOString()
    const row: LocalRow = {
      id: crypto.randomUUID(), name: input.name, parcours: input.data.meta.libre ? 'libre' : 'template', theme_id: input.themeId ?? null,
      format_key: input.data.meta.libre ?? input.data.meta.format, preview_url: await this.thumb(input.thumb), status: 'draft',
      master_edited: false, updated_at: now, created_at: now, sent_at: null, canvas_json: input.data,
    }
    this.write([...rows, row])
    return this.strip(row)
  }

  async update(id: string, since: string | null, input: SaveInput) {
    const rows = this.read()
    const r = rows.find((x) => x.id === id)
    if (!r || (since && r.updated_at !== since)) throw new ConflictError(r ? this.strip(r) : null)
    Object.assign(r, {
      name: input.name, canvas_json: input.data, format_key: input.data.meta.libre ?? input.data.meta.format,
      parcours: input.data.meta.libre ? 'libre' : 'template', theme_id: input.themeId ?? null,
      updated_at: new Date().toISOString(), preview_url: (await this.thumb(input.thumb)) ?? r.preview_url,
    })
    this.write(rows)
    return this.strip(r)
  }

  async rename(id: string, name: string) {
    const rows = this.read()
    const r = rows.find((x) => x.id === id)
    if (!r) throw new Error('Projet introuvable')
    r.name = name
    r.updated_at = new Date().toISOString()
    this.write(rows)
    return this.strip(r)
  }

  async duplicate(id: string) {
    const rows = this.read()
    if (rows.length >= MAX_PROJECTS) throw new LimitError(rows.map(this.strip))
    const r = rows.find((x) => x.id === id)
    if (!r) throw new Error('Projet introuvable')
    const now = new Date().toISOString()
    const copy: LocalRow = { ...structuredClone(r), id: crypto.randomUUID(), name: `${r.name ?? 'Projet'} (copie)`, status: 'draft', created_at: now, updated_at: now, sent_at: null }
    this.write([...rows, copy])
    return this.strip(copy)
  }

  async remove(id: string) { this.write(this.read().filter((r) => r.id !== id)) }

  async markSent(id: string) {
    const rows = this.read()
    const r = rows.find((x) => x.id === id)
    if (r) { r.status = 'sent'; r.sent_at = new Date().toISOString(); this.write(rows) }
  }
}

export function projectStore(identity: Identity): ProjectStore {
  return identity.kind === 'user' && identity.userId ? new RemoteStore(identity.userId) : new LocalStore(identity.email)
}

// ───────────── lecture du contenu (nouveau format v2 et ancien Studio v1) ─────────────
type V1 = { v: 1; ed_scale?: number; fond?: string | null; objs?: Record<string, unknown>[] }

/** Contenu d'un projet, en convertissant au besoin un projet de l'ancien Studio (pixels d'écran). */
export function readProject(row: ProjectRow): { data: ProjectData | null; legacy: V1 | null } {
  const cj = row.canvas_json as ProjectData | V1 | null | undefined
  if (!cj) return { data: null, legacy: null }
  if (cj.v === 2) return { data: cj, legacy: null }
  return { data: null, legacy: cj as V1 }
}

/** Ancien format → nouveau document, une fois le format (w, h) et le fond connus. */
export function convertV1(v1: V1, spec: { w: number; h: number; bookmark: boolean; src?: string }): DocJSON {
  const k = 1 / (v1.ed_scale || 1)
  const objects = (v1.objs ?? [])
    .filter((o) => !o._isBg && !o._twin && !o._jumeau)
    .map((o) => {
      const n: Record<string, unknown> = { ...o }
      n.left = Number(o.left ?? 0) * k
      n.top = Number(o.top ?? 0) * k
      if (o.type === 'i-text' || o.type === 'text' || o.type === 'textbox') n.fontSize = Number(o.fontSize ?? 20) * k
      else { n.scaleX = Number(o.scaleX ?? 1) * k; n.scaleY = Number(o.scaleY ?? 1) * k }
      if (o._photoZone) { n.role = 'zone'; n.zone = Number(o._numZone ?? 1); n.fill = 'rgba(216,50,50,.32)'; n.width = Number(o.width) * Number(n.scaleX); n.height = Number(o.height) * Number(n.scaleY); n.scaleX = 1; n.scaleY = 1 }
      else if (o.type === 'image') n.role = 'image'
      else if (String(o.type).includes('text')) n.role = 'text'
      delete n.version
      return n
    })
  return {
    v: 2, w: spec.w, h: spec.h, bookmark: spec.bookmark, objects,
    background: v1.fond ? { kind: 'generated', id: v1.fond } : spec.src ? { kind: 'theme', src: spec.src } : { kind: 'color', color: '#ffffff' },
  }
}
