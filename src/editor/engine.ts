import {
  ActiveSelection,
  Canvas,
  FabricImage,
  FabricObject,
  IText,
  InteractiveFabricObject,
  Point,
  Rect,
  util,
  type TMat2D,
} from 'fabric'
import { assetUrl, putEditedAsset } from './assets'
import { renderBackground } from './backgrounds'
import { canvasBlob, dilate, eraseMask, elementMask, maskBounds, readPixels, toCanvas, wandMask } from './pixels'

/**
 * Moteur de l'éditeur (Fabric 7).
 * - Le document vit en pixels d'impression (w × h natifs) ; l'écran n'est qu'un viewportTransform.
 *   Corrige l'existant qui stockait des pixels d'écran (ed_scale).
 * - Le fond (PNG du thème ou fond généré) est canvas.backgroundImage : il ne peut jamais passer
 *   devant ni derrière un objet.
 * - Marque-page double : on travaille sur la moitié gauche, la droite est un rendu identique
 *   (écran et export), sans objets dupliqués à synchroniser.
 */

// Propriétés maison conservées dans canvas_json.
FabricObject.customProperties = ['uid', 'role', 'zone', 'srcKey', 'locked']

// Poignées et cadre de sélection du prototype (violet #7c5cff, poignées rondes).
Object.assign(InteractiveFabricObject.ownDefaults, {
  borderColor: '#7c5cff',
  cornerColor: '#ffffff',
  cornerStrokeColor: '#7c5cff',
  cornerStyle: 'circle',
  cornerSize: 11,
  touchCornerSize: 28,
  transparentCorners: false,
  borderScaleFactor: 1.5,
  padding: 4,
})

export type Role = 'names' | 'date' | 'text' | 'image' | 'zone' | 'digit'
export type EditorObject = FabricObject & { uid?: string; role?: Role; zone?: number; locked?: boolean; srcKey?: string }
export type TextObject = IText & { uid?: string; role?: Role }

export type DocBackground =
  | { kind: 'theme'; src: string }
  | { kind: 'color'; color: string }
  | { kind: 'generated'; id: string }
  /** fond retouché (main magique) : fichier gardé comme les images importées */
  | { kind: 'asset'; key: string; src: string; from?: DocBackground }

export type Tool = 'select' | 'hand' | 'wand' | 'eraser'
export type ToolResult = 'ok' | 'noimage' | 'nobg' | 'empty' | 'toobig' | 'busy'
export type DocJSON = {
  v: 2
  w: number
  h: number
  bookmark: boolean
  background: DocBackground | null
  objects: Record<string, unknown>[]
}

type Guide = { axis: 'x' | 'y'; pos: number; strong: boolean }
type Listener = () => void

const HISTORY_MAX = 60
const PAD = 28 // marge autour de la page à l'écran (px)
export const MIN_ZOOM = 1 // 100 % = page entière visible (zoom limité au canvas)
export const MAX_ZOOM = 4
export const ZONE_MAX = 4

/** Photos d'exemple affichées dans les zones (écran seulement ; jamais à l'export). */
const zonePreview: { photos: HTMLImageElement[]; on: boolean; exporting: boolean } = { photos: [], on: false, exporting: false }

/** Dessine une image en mode « cover » dans le rectangle (x, y, w, h), cadrée vers le haut (visages). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const k = Math.max(w / img.width, h / img.height)
  const sw = w / k
  const sh = h / k
  const sx = (img.width - sw) / 2
  const sy = Math.max(0, (img.height - sh) * 0.28)
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

/** Icône + numéro au centre d'une prise de vue (repère local de l'objet). */
function drawZoneLabel(ctx: CanvasRenderingContext2D, z: FabricObject & { zone?: number }, small = false) {
  const sx = z.scaleX ?? 1
  const sy = z.scaleY ?? 1
  const size = Math.max(18, Math.min((z.width ?? 0) * sx, (z.height ?? 0) * sy) * (small ? 0.14 : 0.28))
  ctx.save()
  ctx.scale(1 / sx, 1 / sy)
  if (small) {
    // pastille numérotée dans le coin, la photo reste visible
    const w = (z.width ?? 0) * sx
    const h = (z.height ?? 0) * sy
    ctx.translate(-w / 2 + size * 1.1, -h / 2 + size * 1.1)
    ctx.fillStyle = 'rgba(216,50,50,.9)'
    ctx.beginPath(); ctx.arc(0, 0, size * 0.85, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${size}px Poppins, sans-serif`
    ctx.fillText(String(z.zone ?? ''), 0, size * 0.05)
    ctx.restore()
    return
  }
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,.25)'
  ctx.shadowBlur = size * 0.15
  ctx.font = `600 ${size}px Poppins, sans-serif`
  ctx.fillText(String(z.zone ?? ''), size * 0.32, 0)
  ctx.font = `${size * 0.62}px sans-serif`
  ctx.fillText('📷', -size * 0.42, 0)
  ctx.restore()
}
const ZONE_FILL = 'rgba(216,50,50,.32)'
const ZONE_STROKE = '#d83232'
const uid = () => Math.random().toString(36).slice(2, 10)

export class StudioEditor {
  readonly canvas: Canvas
  readonly w: number
  readonly h: number
  readonly bookmark: boolean
  background: DocBackground | null = null

  private host: HTMLElement
  private fit = 1
  private rel = 1 // zoom relatif à « page entière »
  private guides: Guide[] = []
  private exporting = false
  private listeners = new Set<Listener>()
  private undoStack: string[] = []
  private redoStack: string[] = []
  private restoring = false
  private recordTimer = 0
  private ro: ResizeObserver
  private panning: { x: number; y: number } | null = null
  private spaceDown = false
  private loading = false
  private clip: EditorObject | null = null
  dirty = false
  /** Photos d'exemple dans les emplacements du template (écran seulement). */
  private samples: { box: [number, number, number, number]; img: HTMLImageElement }[] = []
  showSamples = true
  tool: Tool = 'select'
  toolOpts = { tol: 30, contiguous: true, brush: 40 }
  busy = false
  private eraser: { img: FabricImage & EditorObject; work: HTMLCanvasElement; last: Point } | null = null
  private pointer: Point | null = null
  /** Rappel de l'interface après un clic d'outil (message à afficher). */
  onToolResult?: (tool: Tool, r: ToolResult) => void

  constructor(el: HTMLCanvasElement, host: HTMLElement, opts: { w: number; h: number; bookmark?: boolean }) {
    this.host = host
    this.w = opts.w
    this.h = opts.h
    this.bookmark = !!opts.bookmark
    this.canvas = new Canvas(el, {
      preserveObjectStacking: true,
      controlsAboveOverlay: true,
      stopContextMenu: true,
      selectionColor: 'rgba(124,92,255,.08)',
      selectionBorderColor: '#7c5cff',
      selectionLineWidth: 1,
    })
    this.bindCanvas()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.resize()
  }

  // ───────────── abonnement React ─────────────
  on(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private emit() { this.listeners.forEach((f) => f()) }
  /** Prévient l'interface d'un changement de réglage. */
  touch() { this.emit() }

  dispose() {
    this.ro.disconnect()
    clearTimeout(this.recordTimer)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.canvas.dispose()
  }

  /** Zone où les objets doivent rester : la page, ou la moitié gauche d'un marque-page. */
  get area() { return { left: 0, top: 0, right: this.bookmark ? this.w / 2 : this.w, bottom: this.h } }

  // ───────────── affichage & zoom ─────────────
  private resize() {
    const { clientWidth: cw, clientHeight: ch } = this.host
    if (!cw || !ch) return
    this.canvas.setDimensions({ width: cw, height: ch })
    this.fit = Math.min((cw - PAD * 2) / this.w, (ch - PAD * 2) / this.h)
    this.applyZoom(this.rel)
  }

  get zoomPercent() { return Math.round(this.rel * 100) }
  get scale() { return this.canvas.getZoom() }

  /** Zoom autour d'un point écran (par défaut le centre), borné, puis recadrage. */
  applyZoom(rel: number, around?: Point) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rel))
    const z = this.fit * next
    const c = this.canvas
    if (around && this.rel !== next) c.zoomToPoint(around, z)
    else {
      const vpt = c.viewportTransform.slice() as TMat2D
      const center = new Point(c.width / 2, c.height / 2)
      const docPt = util.transformPoint(center, util.invertTransform(vpt))
      vpt[0] = vpt[3] = z
      vpt[4] = center.x - docPt.x * z
      vpt[5] = center.y - docPt.y * z
      c.setViewportTransform(vpt)
    }
    this.rel = next
    this.clampPan()
    this.emit()
  }

  zoomBy(step: number) { this.applyZoom(this.rel * (step > 0 ? 1.25 : 0.8)) }
  zoomFit() { this.rel = MIN_ZOOM; this.applyZoom(MIN_ZOOM) }

  /** La page ne peut pas sortir de l'écran : centrée si plus petite, bords collés sinon. */
  private clampPan() {
    const c = this.canvas
    const vpt = c.viewportTransform.slice() as TMat2D
    const z = vpt[0]
    const pw = this.w * z
    const ph = this.h * z
    const clamp = (t: number, page: number, view: number) =>
      page + PAD * 2 <= view ? (view - page) / 2 : Math.min(PAD, Math.max(view - page - PAD, t))
    vpt[4] = clamp(vpt[4], pw, c.width)
    vpt[5] = clamp(vpt[5], ph, c.height)
    c.setViewportTransform(vpt)
    c.requestRenderAll()
  }

  private pan(dx: number, dy: number) {
    const vpt = this.canvas.viewportTransform.slice() as TMat2D
    vpt[4] += dx
    vpt[5] += dy
    this.canvas.setViewportTransform(vpt)
    this.clampPan()
    this.emit()
  }

  /** Rectangle écran (relatif à l'hôte) d'un objet : sert à la barre contextuelle et au tuto. */
  screenRect(o: FabricObject) {
    const vpt = this.canvas.viewportTransform
    const pts = o.getCoords().map((p) => util.transformPoint(p, vpt))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
  }

  // ───────────── fond ─────────────
  async setBackgroundImage(src: string, bg: DocBackground) {
    const img = await FabricImage.fromURL(src, { crossOrigin: 'anonymous' })
    img.set({ originX: 'left', originY: 'top', left: 0, top: 0, scaleX: this.w / img.width, scaleY: this.h / img.height, selectable: false, evented: false })
    this.canvas.backgroundImage = img
    this.background = bg
    this.canvas.requestRenderAll()
  }

/** Fond de la bibliothèque (dessiné en pleine résolution ; deux bandes identiques pour un marque-page). */
  setGeneratedBackground(id: string) {
    const bw = this.bookmark ? this.w / 2 : this.w
    const tile = renderBackground(id, bw, this.h)
    let el = tile
    if (this.bookmark) {
      el = document.createElement('canvas')
      el.width = this.w
      el.height = this.h
      const g = el.getContext('2d')!
      g.drawImage(tile, 0, 0)
      g.drawImage(tile, bw, 0)
    }
    const img = new FabricImage(el, { originX: 'left', originY: 'top', left: 0, top: 0, selectable: false, evented: false })
    this.canvas.backgroundImage = img
    this.background = { kind: 'generated', id }
    this.canvas.requestRenderAll()
  }

  /** Applique un fond décrit (chargement, annuler/refaire). */
  async applyBackground(bg: DocBackground | null) {
    if (!bg) { this.canvas.backgroundImage = undefined; this.background = null; this.canvas.requestRenderAll(); return }
    if (bg.kind === 'color') this.setBackgroundColor(bg.color)
    else if (bg.kind === 'generated') this.setGeneratedBackground(bg.id)
    else if (bg.kind === 'asset') await this.setBackgroundImage((await assetUrl(bg.key)) ?? bg.src, bg)
    else await this.setBackgroundImage(bg.src, bg)
  }

/** Photos d'exemple : une par trou du template, et une par zone photo (dans l'ordre des numéros). */
  setSamples(holes: { box: [number, number, number, number]; img: HTMLImageElement }[], zonePhotos: HTMLImageElement[]) {
    this.samples = holes
    zonePreview.photos = zonePhotos
    zonePreview.on = this.showSamples
    this.objects.forEach((o) => { if (o.role === 'zone') o.dirty = true })
    this.canvas.requestRenderAll()
  }

  toggleSamples(on = !this.showSamples) {
    this.showSamples = on
    zonePreview.on = on
    this.objects.forEach((o) => { if (o.role === 'zone') o.dirty = true })
    this.canvas.requestRenderAll()
    this.emit()
  }

  setBackgroundColor(color: string) {
    this.canvas.backgroundImage = undefined
    this.background = { kind: 'color', color }
    this.canvas.requestRenderAll()
  }

  // ───────────── objets ─────────────
  get objects() { return this.canvas.getObjects() as EditorObject[] }
  get active(): EditorObject | undefined { return (this.canvas.getActiveObject() as EditorObject) ?? undefined }

  add(o: EditorObject, select = true) {
    o.uid ??= uid()
    this.canvas.add(o)
    this.keepInside(o)
    if (select) this.canvas.setActiveObject(o)
    this.canvas.requestRenderAll()
  }

  addText(opts: { text: string; x: number; y: number; size: number; color?: string; font?: string; bold?: boolean; italic?: boolean; align?: string; spacing?: number; role?: Role }, select = true) {
    const t = new IText(opts.text, {
      left: opts.x,
      top: opts.y,
      fontSize: opts.size,
      fill: opts.color ?? '#1a1410',
      fontFamily: opts.font ?? 'Poppins',
      fontWeight: opts.bold ? 'bold' : 'normal',
      fontStyle: opts.italic ? 'italic' : 'normal',
      textAlign: (opts.align as 'left' | 'center' | 'right') ?? 'center',
      charSpacing: opts.spacing ?? 0,
      lineHeight: 1.1,
      editingBorderColor: '#7c5cff',
      cursorColor: '#7c5cff',
      selectionColor: 'rgba(242,193,46,.35)',
    }) as TextObject
    t.role = opts.role ?? 'text'
    this.add(t, select)
    return t
  }

  /** Modifie des propriétés et enregistre l'étape dans l'historique. */
  update(o: FabricObject, props: Record<string, unknown>) {
    o.set(props)
    o.setCoords()
    if ('fontFamily' in props || 'fontSize' in props || 'charSpacing' in props || 'fontWeight' in props) (o as IText).initDimensions?.()
    this.keepInside(o)
    this.canvas.requestRenderAll()
    this.record()
    this.emit()
  }

  async duplicate() {
    const o = this.active
    if (!o) return
    if (o.role === 'zone') { this.addZone(o); return }
    const c = (await o.clone(FabricObject.customProperties)) as EditorObject
    c.uid = uid()
    c.set({ left: (o.left ?? 0) + 24, top: (o.top ?? 0) + 24 })
    if (c instanceof ActiveSelection) {
      c.canvas = this.canvas
      c.forEachObject((x) => { (x as EditorObject).uid = uid(); this.canvas.add(x) })
      c.setCoords()
      this.canvas.setActiveObject(c)
    } else this.add(c)
    this.record()
  }

  remove() {
    const sel = this.canvas.getActiveObjects()
    if (!sel.length) return
    const t = sel[0] as IText
    if (sel.length === 1 && t.isEditing) return
    this.canvas.discardActiveObject()
    sel.forEach((o) => this.canvas.remove(o))
    this.canvas.requestRenderAll()
    this.record()
  }

// ───────────── images ─────────────
  /** Ajoute une image (déjà enregistrée dans assets.ts sous srcKey), centrée et à taille raisonnable. */
  async addImage(url: string, srcKey: string | undefined, role: Role = 'image') {
    const img = (await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })) as FabricImage & EditorObject
    const a = this.area
    const share = role === 'digit' ? 0.22 : this.bookmark ? 0.8 : 0.45
    const k = Math.min(((a.right - a.left) * share) / img.width, ((a.bottom - a.top) * share) / img.height, 1.5)
    img.set({ left: (a.left + a.right) / 2, top: (a.top + a.bottom) / 2, scaleX: k, scaleY: k })
    if (srcKey) img.srcKey = srcKey
    img.role = role
    this.add(img)
    this.record(true)
    return img
  }

  /** Remplace le contenu d'une image (gomme, baguette, détourage) en gardant position et taille. */
  async replaceImage(o: FabricImage & EditorObject, url: string, srcKey: string) {
    await o.setSrc(url, { crossOrigin: 'anonymous' })
    o.srcKey = srcKey
    this.canvas.requestRenderAll()
    this.record(true)
    this.emit()
  }

  // ───────────── copier / coller ─────────────
  async copy(cut = false) {
    const o = this.active
    if (!o || (o as IText).isEditing) return false
    this.clip = (await o.clone(FabricObject.customProperties)) as EditorObject
    if (cut) this.remove()
    return true
  }

  async paste() {
    if (!this.clip) return false
    if (this.clip.role === 'zone') { this.addZone(this.clip); return true }
    const c = (await this.clip.clone(FabricObject.customProperties)) as EditorObject
    this.clip.set({ left: (this.clip.left ?? 0) + 24, top: (this.clip.top ?? 0) + 24 })
    c.uid = uid()
    if (c instanceof ActiveSelection) {
      c.canvas = this.canvas
      c.forEachObject((x) => { (x as EditorObject).uid = uid(); if ((x as EditorObject).role !== 'zone') this.canvas.add(x) })
      c.setCoords()
      this.canvas.setActiveObject(c)
    } else this.add(c)
    this.record(true)
    return true
  }

  // ───────────── zones photo (prises de vue) ─────────────
  get zones() {
    return this.objects.filter((o) => o.role === 'zone').sort((a, b) => (a.zone ?? 0) - (b.zone ?? 0)) as (Rect & EditorObject)[]
  }

  /**
   * Ajoute une prise de vue numérotée (4 max). La zone 1 se dimensionne librement ;
   * les suivantes prennent ses proportions et ne se redimensionnent que par les coins.
   */
  addZone(near?: FabricObject): number | null {
    const zs = this.zones
    if (zs.length >= ZONE_MAX) return null
    const a = this.area
    const aw = a.right - a.left
    const ah = a.bottom - a.top
    const first = zs[0]
    let w = aw * 0.6
    let h = (w * 2) / 3
    if (first) { w = first.width; h = first.height }
    else if (h > ah * 0.4) { h = ah * 0.4; w = h * 1.5 }
    const n = zs.length
    const r = new Rect({
      width: w, height: h,
      left: near ? (near.left ?? 0) + 30 : (a.left + a.right) / 2 + n * aw * 0.03,
      top: near ? (near.top ?? 0) + 30 : a.top + ah * 0.3 + n * ah * 0.06,
      fill: ZONE_FILL, stroke: ZONE_STROKE, strokeWidth: 4, strokeUniform: true, rx: 6, ry: 6,
    }) as Rect & EditorObject
    r.role = 'zone'
    r.zone = n + 1
    this.styleZone(r)
    this.add(r)
    this.record(true)
    return r.zone
  }

  private styleZone(r: EditorObject) {
    // Le numéro est dessiné avec la zone : il respecte l'ordre des calques et la copie du marque-page.
    const z = r as Rect & EditorObject & { _render: (ctx: CanvasRenderingContext2D) => void }
    z._render = function (ctx: CanvasRenderingContext2D) {
      const photo = zonePreview.on && !zonePreview.exporting ? zonePreview.photos[((this as EditorObject).zone ?? 1) - 1] : undefined
      if (photo) {
        ctx.save()
        drawCover(ctx, photo, -this.width / 2, -this.height / 2, this.width, this.height)
        ctx.restore()
        drawZoneLabel(ctx, this, true)
      } else {
        Rect.prototype._render.call(this, ctx)
        drawZoneLabel(ctx, this)
      }
    }
    const free = r.zone === 1
    r.setControlsVisibility({ mt: free, mb: free, ml: free, mr: free })
    r.set({ lockScalingFlip: true, lockSkewingX: true, lockSkewingY: true, fill: ZONE_FILL, stroke: ZONE_STROKE })
  }

  /** Renumérote 1…n (après suppression) puis réaligne les proportions sur la zone 1. */
  renumberZones() {
    this.zones.forEach((z, i) => { z.zone = i + 1; this.styleZone(z); z.dirty = true })
    this.propagateRatio()
    this.canvas.requestRenderAll()
  }

  /** Les zones 2 à 4 suivent les proportions de la zone 1 (largeur conservée). */
  private propagateRatio() {
    const [first, ...rest] = this.zones
    if (!first) return
    const ratio = first.width / first.height
    for (const z of rest) {
      z.set({ height: z.width / ratio })
      z.setCoords()
      this.keepInside(z)
    }
  }

// ───────────── outils : main magique, baguette, gomme ─────────────
  setTool(t: Tool) {
    const c = this.canvas
    this.tool = t
    const sel = t === 'select'
    c.selection = sel
    c.skipTargetFind = !sel
    c.defaultCursor = sel ? 'default' : t === 'eraser' ? 'none' : 'crosshair'
    c.hoverCursor = sel ? 'move' : c.defaultCursor
    if (!sel && t !== 'eraser') c.discardActiveObject()
    c.requestRenderAll()
    this.emit()
  }

  /** Image la plus haute sous un point de la page. */
  imageAt(p: Point) {
    const objs = this.objects
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i]
      if (o instanceof FabricImage && o.visible && o.containsPoint(p)) return o as FabricImage & EditorObject
    }
    return undefined
  }

  /** Point de la page → pixel de l'image source (rotation, échelle et miroir compris). */
  private imagePixel(img: FabricImage, p: Point) {
    const local = util.transformPoint(p, util.invertTransform(img.calcTransformMatrix()))
    return { x: Math.floor(local.x + img.width / 2), y: Math.floor(local.y + img.height / 2) }
  }

  /** Baguette : efface la zone de couleur cliquée dans l'image. */
  async wandAt(p: Point): Promise<ToolResult> {
    const img = this.imageAt(p)
    if (!img) return 'noimage'
    const { x, y } = this.imagePixel(img, p)
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 'noimage'
    const data = readPixels(img.getElement() as HTMLImageElement, img.width, img.height)
    const mask = wandMask(data, x, y, this.toolOpts.tol, this.toolOpts.contiguous)
    eraseMask(data, mask)
    const { key, url } = await putEditedAsset(await canvasBlob(toCanvas(data)))
    await this.replaceImage(img, url, key)
    return 'ok'
  }

  /**
   * Main magique : détache le motif cliqué du fond du template pour en faire un élément déplaçable ;
   * l'emplacement d'origine est rebouché avec la couleur dominante du fond.
   */
  async magicHandAt(p: Point): Promise<ToolResult> {
    const bgImg = this.canvas.backgroundImage as FabricImage | undefined
    if (!bgImg) return 'nobg'
    const W = bgImg.width
    const H = bgImg.height
    const sx = this.w / W
    const sy = this.h / H
    const x = Math.floor(p.x / sx)
    const y = Math.floor(p.y / sy)
    if (x < 0 || y < 0 || x >= W || y >= H) return 'empty'
    const data = readPixels(bgImg.getElement() as HTMLImageElement, W, H)
    const { mask, bg } = elementMask(data, x, y, this.toolOpts.tol)
    const b = maskBounds(mask, W)
    if (!b || b.n < 30) return 'empty'
    if (b.n > W * H * 0.45) return 'toobig'

    // l'élément extrait
    const part = new ImageData(b.w, b.h)
    for (let yy = 0; yy < b.h; yy++)
      for (let xx = 0; xx < b.w; xx++) {
        const sp = (b.y + yy) * W + (b.x + xx)
        if (!mask[sp]) continue
        const si = sp * 4
        const di = (yy * b.w + xx) * 4
        part.data[di] = data.data[si]
        part.data[di + 1] = data.data[si + 1]
        part.data[di + 2] = data.data[si + 2]
        part.data[di + 3] = data.data[si + 3]
      }
    const partAsset = await putEditedAsset(await canvasBlob(toCanvas(part)))

    // le fond rebouché (et la bande de droite d'un marque-page, qui est la copie)
    const fillMask = dilate(mask, W, H, 2)
    const half = Math.floor(W / 2)
    for (let q = 0; q < fillMask.length; q++) {
      if (!fillMask[q]) continue
      const targets = [q]
      if (this.bookmark && q % W < half) targets.push(q + half)
      for (const t of targets) data.data.set(bg, t * 4)
    }
    const bgAsset = await putEditedAsset(await canvasBlob(toCanvas(data)))
    const from = this.background?.kind === 'asset' ? this.background.from : this.background ?? undefined
    await this.setBackgroundImage(bgAsset.url, { kind: 'asset', key: bgAsset.key, src: bgAsset.url, from })

    const el = (await FabricImage.fromURL(partAsset.url)) as FabricImage & EditorObject
    el.set({ left: (b.x + b.w / 2) * sx, top: (b.y + b.h / 2) * sy, scaleX: sx, scaleY: sy })
    el.srcKey = partAsset.key
    el.role = 'image'
    this.add(el)
    this.setTool('select')
    this.canvas.setActiveObject(el)
    this.record(true)
    return 'ok'
  }

  private async runTool(p: Point) {
    if (this.busy) { this.onToolResult?.(this.tool, 'busy'); return }
    this.busy = true
    this.emit()
    const tool = this.tool
    try {
      const r = tool === 'wand' ? await this.wandAt(p) : await this.magicHandAt(p)
      this.onToolResult?.(tool, r)
    } catch (e) {
      console.error(e)
      this.onToolResult?.(tool, 'empty')
    } finally {
      this.busy = false
      this.emit()
    }
  }

  // gomme : on peint en « destination-out » sur une copie de l'image, aperçu en direct
  private eraseStart(p: Point) {
    const img = (this.active instanceof FabricImage ? this.active : undefined) as (FabricImage & EditorObject) | undefined
    const target = img && img.containsPoint(p) ? img : this.imageAt(p)
    if (!target) { this.onToolResult?.('eraser', 'noimage'); return }
    const work = document.createElement('canvas')
    work.width = target.width
    work.height = target.height
    work.getContext('2d')!.drawImage(target.getElement() as HTMLImageElement, 0, 0, target.width, target.height)
    this.eraser = { img: target, work, last: p }
    target.setElement(work)
    this.eraseTo(p)
  }

  private eraseTo(p: Point) {
    const e = this.eraser
    if (!e) return
    const a = this.imagePixel(e.img, e.last)
    const b = this.imagePixel(e.img, p)
    const ctx = e.work.getContext('2d')!
    const r = this.toolOpts.brush / this.scale / Math.abs(e.img.scaleX ?? 1)
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = r
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x + 0.01, b.y)
    ctx.stroke()
    ctx.restore()
    e.last = p
    e.img.dirty = true
    this.canvas.requestRenderAll()
  }

  private async eraseEnd() {
    const e = this.eraser
    this.eraser = null
    if (!e) return
    const { key, url } = await putEditedAsset(await canvasBlob(e.work))
    await this.replaceImage(e.img, url, key)
  }

  forward() { const o = this.active; if (o) { this.canvas.bringObjectForward(o); this.afterReorder() } }
  backward() { const o = this.active; if (o) { this.canvas.sendObjectBackwards(o); this.afterReorder() } }
  private afterReorder() { this.canvas.requestRenderAll(); this.record(); this.emit() }

  /** Centre l'objet horizontalement dans la zone de travail. */
  centerH() {
    const o = this.active
    if (!o) return
    const c = o.getCenterPoint()
    o.setPositionByOrigin(new Point((this.area.left + this.area.right) / 2, c.y), 'center', 'center')
    this.update(o, {})
  }

  /** Garde l'objet dans la zone : réduit s'il est trop grand, puis le recale. */
  keepInside(o: FabricObject) {
    const a = this.area
    o.setCoords()
    let b = o.getBoundingRect()
    const maxW = a.right - a.left
    const maxH = a.bottom - a.top
    if (b.width > maxW + 0.5 || b.height > maxH + 0.5) {
      const k = Math.min(maxW / b.width, maxH / b.height)
      if (o instanceof IText) o.set({ fontSize: Math.max(4, (o.fontSize ?? 12) * k) })
      else o.set({ scaleX: (o.scaleX ?? 1) * k, scaleY: (o.scaleY ?? 1) * k })
      o.setCoords()
      b = o.getBoundingRect()
    }
    let dx = 0
    let dy = 0
    if (b.left < a.left) dx = a.left - b.left
    else if (b.left + b.width > a.right) dx = a.right - (b.left + b.width)
    if (b.top < a.top) dy = a.top - b.top
    else if (b.top + b.height > a.bottom) dy = a.bottom - (b.top + b.height)
    if (dx || dy) {
      o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy })
      o.setCoords()
    }
  }

  // ───────────── historique ─────────────
  private snapshot() { return JSON.stringify(this.toJSON()) }

  /** Enregistre l'état courant (regroupé : plusieurs changements rapprochés = 1 étape). */
  record(immediate = false) {
    if (this.restoring) return
    clearTimeout(this.recordTimer)
    const push = () => {
      const s = this.snapshot()
      if (this.undoStack[this.undoStack.length - 1] === s) return
      this.undoStack.push(s)
      if (this.undoStack.length > HISTORY_MAX) this.undoStack.shift()
      this.redoStack = []
      this.dirty = true
      this.emit()
    }
    if (immediate) push()
    else this.recordTimer = window.setTimeout(push, 160)
  }

  /** Point de départ de l'historique (après chargement). */
  resetHistory() { this.undoStack = [this.snapshot()]; this.redoStack = []; this.dirty = false; this.emit() }

  get canUndo() { return this.undoStack.length > 1 }
  get canRedo() { return this.redoStack.length > 0 }

  async undo() {
    if (!this.canUndo) return
    this.redoStack.push(this.undoStack.pop()!)
    await this.restore(this.undoStack[this.undoStack.length - 1])
  }

  async redo() {
    const s = this.redoStack.pop()
    if (!s) return
    this.undoStack.push(s)
    await this.restore(s)
  }

  private async restore(s: string) {
    this.restoring = true
    try {
      const doc = JSON.parse(s) as DocJSON
      await this.loadJSON(doc, JSON.stringify(doc.background) !== JSON.stringify(this.background))
    } finally { this.restoring = false }
    this.dirty = true
    this.emit()
  }

  // ───────────── sérialisation ─────────────
  toJSON(): DocJSON {
    return {
      v: 2,
      w: this.w,
      h: this.h,
      bookmark: this.bookmark,
      background: this.background,
      objects: this.objects.map((o) => o.toObject(FabricObject.customProperties) as Record<string, unknown>),
    }
  }

  async loadJSON(doc: DocJSON, withBackground = true) {
    const c = this.canvas
    const activeUid = this.active?.uid
    this.loading = true
    c.discardActiveObject()
    c.remove(...c.getObjects())
    const src = await Promise.all(doc.objects.map(async (o) => (o.srcKey ? { ...o, src: (await assetUrl(String(o.srcKey))) ?? o.src } : o)))
    const objs = (await util.enlivenObjects(src)) as EditorObject[]
    objs.forEach((o) => { if (o.role === 'zone') this.styleZone(o); c.add(o) })
    this.loading = false
    if (withBackground) await this.applyBackground(doc.background)
    const again = objs.find((o) => o.uid === activeUid)
    if (again) c.setActiveObject(again)
    c.requestRenderAll()
  }

  // ───────────── export (utilisé aux étapes 7-8) ─────────────
  /** Rendu exact w × h en pixels natifs, fond compris, sans cadre ni guides. */
  renderNative(opts: { multiplier?: number; filter?: Parameters<Canvas["toCanvasElement"]>[1] extends infer O ? O extends { filter?: infer F } ? F : never : never } = {}) {
    const c = this.canvas
    const vpt = c.viewportTransform.slice() as TMat2D
    this.exporting = true
    zonePreview.exporting = true
    this.objects.forEach((o) => { if (o.role === 'zone') o.dirty = true })
    c.viewportTransform = [1, 0, 0, 1, 0, 0]
    try {
      return c.toCanvasElement(opts.multiplier ?? 1, { left: 0, top: 0, width: this.w, height: this.h, filter: opts.filter })
    } finally {
      this.exporting = false
      zonePreview.exporting = false
      this.objects.forEach((o) => { if (o.role === 'zone') o.dirty = true })
      c.setViewportTransform(vpt)
      c.requestRenderAll()
    }
  }

  // ───────────── événements Fabric ─────────────
  private bindCanvas() {
    const c = this.canvas

    // Page blanche + ombre sous le document (pas dans l'export : les trous restent transparents).
    c.on('before:render', ({ ctx }) => {
      if (this.exporting) return
      const v = c.viewportTransform
      ctx.save()
      ctx.fillStyle = '#E8E8E4'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5])
      ctx.shadowColor = 'rgba(0,0,0,.18)'
      ctx.shadowBlur = 40 * v[0]
      ctx.shadowOffsetY = 10 * v[0]
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, this.w, this.h)
      ctx.shadowColor = 'transparent'
      // photos d'exemple sous le template (les trous les laissent voir)
      const theme = this.background?.kind === 'theme' || this.background?.kind === 'asset'
      if (this.showSamples && theme) for (const s of this.samples) drawCover(ctx, s.img, s.box[0] * this.w, s.box[1] * this.h, (s.box[2] - s.box[0]) * this.w, (s.box[3] - s.box[1]) * this.h)
      ctx.restore()
    })

    c.on('after:render', ({ ctx }) => {
      const v = c.viewportTransform
      ctx.save()
      ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5])
      if (this.bookmark) this.renderMirror(ctx)
      if (!this.exporting) this.renderGuides(ctx, v[0])
      if (!this.exporting && this.tool === 'eraser' && this.pointer) {
        ctx.beginPath()
        ctx.arc(this.pointer.x, this.pointer.y, this.toolOpts.brush / 2 / v[0], 0, Math.PI * 2)
        ctx.lineWidth = 1.5 / v[0]
        ctx.strokeStyle = '#7c5cff'
        ctx.stroke()
      }
      ctx.restore()
    })

    c.on('object:moving', (e) => this.snap(e.target))
    c.on('object:scaling', (e) => {
      const z = e.target as EditorObject
      // zones 2 à 4 : proportions verrouillées, même avec Maj
      if (z.role === 'zone' && (z.zone ?? 1) > 1) z.set({ scaleY: z.scaleX })
      this.keepInside(z)
    })
    c.on('object:rotating', (e) => this.keepInside(e.target))
    c.on('object:modified', (e) => {
      this.guides = []
      const t = e.target as IText
      // Texte redimensionné aux poignées : on convertit l'échelle en taille de police
      // (corrige l'affichage de taille faux de l'existant).
      if (t instanceof IText && (t.scaleX !== 1 || t.scaleY !== 1)) {
        t.set({ fontSize: Math.round((t.fontSize ?? 12) * (t.scaleY ?? 1) * 10) / 10, scaleX: 1, scaleY: 1 })
        t.setCoords()
      }
      const z = e.target as EditorObject
      if (z.role === 'zone' && (z.scaleX !== 1 || z.scaleY !== 1)) {
        z.set({ width: (z.width ?? 0) * (z.scaleX ?? 1), height: (z.height ?? 0) * (z.scaleY ?? 1), scaleX: 1, scaleY: 1 })
        z.setCoords()
        if (z.zone === 1) this.propagateRatio()
      }
      this.keepInside(e.target)
      c.requestRenderAll()
      this.record()
      this.emit()
    })
    c.on('mouse:up', () => { if (this.guides.length) { this.guides = []; c.requestRenderAll() } })
    c.on('text:changed', () => { this.record(); this.emit() })
    c.on('text:editing:exited', (e) => {
      const t = e.target as IText
      if (!t.text?.trim()) { c.remove(t); c.requestRenderAll() }
      this.record()
    })
    c.on('object:added', () => this.emit())
    c.on('object:removed', (e) => {
      if ((e.target as EditorObject).role === 'zone' && !this.loading && !this.restoring) this.renumberZones()
      this.emit()
    })
    c.on('selection:created', () => this.emit())
    c.on('selection:updated', () => this.emit())
    c.on('selection:cleared', () => this.emit())

    // Zoom : Ctrl + molette (ou pincement du trackpad) autour du curseur ; molette seule = défilement.
    c.on('mouse:wheel', (opt) => {
      const e = opt.e as WheelEvent
      e.preventDefault()
      e.stopPropagation()
      if (e.ctrlKey || e.metaKey) {
        const p = c.getViewportPoint(e)
        this.applyZoom(this.rel * Math.pow(0.998, e.deltaY), p)
      } else this.pan(-e.deltaX, -e.deltaY)
    })

    // Déplacement de la vue : espace + glisser, ou clic molette.
    c.on('mouse:down', (opt) => {
      const e = opt.e as MouseEvent
      if (this.tool !== 'select' && !this.spaceDown && e.button !== 1) {
        const p = c.getScenePoint(e)
        if (this.tool === 'eraser') this.eraseStart(p)
        else this.runTool(p)
        return
      }
      if (this.spaceDown || e.button === 1) {
        this.panning = { x: e.clientX, y: e.clientY }
        c.selection = false
        c.setCursor('grabbing')
      }
    })
    c.on('mouse:move', (opt) => {
      if (this.tool === 'eraser') {
        this.pointer = c.getScenePoint(opt.e as MouseEvent)
        if (this.eraser) this.eraseTo(this.pointer)
        else c.requestRenderAll()
      }
      if (!this.panning) return
      const e = opt.e as MouseEvent
      this.pan(e.clientX - this.panning.x, e.clientY - this.panning.y)
      this.panning = { x: e.clientX, y: e.clientY }
    })
    c.on('mouse:up', () => {
      if (this.eraser) this.eraseEnd()
      if (this.panning) { this.panning = null; c.selection = this.tool === 'select' }
    })
    c.on('mouse:out', () => { if (this.tool === 'eraser') { this.pointer = null; c.requestRenderAll() } })

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  private isTyping(e: KeyboardEvent) {
    const el = e.target as HTMLElement
    return el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? '') || !!(this.active as IText | undefined)?.isEditing
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.isTyping(e)) return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (e.code === 'Space' && !this.spaceDown) { this.spaceDown = true; this.canvas.defaultCursor = 'grab'; e.preventDefault(); return }
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return }
    if (mod && k === 'y') { e.preventDefault(); this.redo(); return }
    if (mod && k === 'c') { this.copy(); return }
    if (mod && k === 'x') { e.preventDefault(); this.copy(true); return }
    if (mod && k === 'd') { e.preventDefault(); this.duplicate(); return }
    if (mod && (k === '+' || k === '=')) { e.preventDefault(); this.zoomBy(1); return }
    if (mod && k === '-') { e.preventDefault(); this.zoomBy(-1); return }
    if (mod && k === '0') { e.preventDefault(); this.zoomFit(); return }
    if (k === 'delete' || k === 'backspace') { if (this.active) { e.preventDefault(); this.remove() } return }
    if (k === 'escape' && this.tool !== 'select') { this.setTool('select'); return }
    if (k === 'escape') { this.canvas.discardActiveObject(); this.canvas.requestRenderAll(); return }
    const arrows: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }
    const o = this.active
    if (o && arrows[k]) {
      e.preventDefault()
      const step = (e.shiftKey ? 10 : 1) / this.scale // 1 px écran (10 avec Maj)
      o.set({ left: (o.left ?? 0) + arrows[k][0] * step, top: (o.top ?? 0) + arrows[k][1] * step })
      this.keepInside(o)
      this.canvas.requestRenderAll()
      this.record() // les flèches entrent aussi dans l'historique (bug de l'existant)
      this.emit()
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') { this.spaceDown = false; this.canvas.defaultCursor = 'default' }
  }

  // ───────────── guides d'alignement & magnétisme ─────────────
  private snap(o: FabricObject) {
    const a = this.area
    const tol = 7 / this.scale
    o.setCoords()
    const b = o.getBoundingRect()
    const xs = { l: b.left, c: b.left + b.width / 2, r: b.left + b.width }
    const ys = { t: b.top, c: b.top + b.height / 2, b: b.top + b.height }
    const tx: { pos: number; strong: boolean }[] = [
      { pos: (a.left + a.right) / 2, strong: true }, { pos: a.left, strong: false }, { pos: a.right, strong: false },
    ]
    const ty: { pos: number; strong: boolean }[] = [
      { pos: (a.top + a.bottom) / 2, strong: true }, { pos: a.top, strong: false }, { pos: a.bottom, strong: false },
    ]
    for (const other of this.objects) {
      if (other === o || !other.visible || (o instanceof ActiveSelection && o.contains(other))) continue
      const ob = other.getBoundingRect()
      tx.push({ pos: ob.left, strong: false }, { pos: ob.left + ob.width / 2, strong: false }, { pos: ob.left + ob.width, strong: false })
      ty.push({ pos: ob.top, strong: false }, { pos: ob.top + ob.height / 2, strong: false }, { pos: ob.top + ob.height, strong: false })
    }
    const best = (edges: number[], targets: { pos: number; strong: boolean }[]) => {
      let r: { d: number; delta: number; t: { pos: number; strong: boolean } } | null = null
      for (const e of edges)
        for (const t of targets) {
          const d = Math.abs(t.pos - e)
          // à distance égale : le centre de la page gagne
          if (d <= tol && (!r || d < r.d - 0.01 || (Math.abs(d - r.d) < 0.01 && t.strong && !r.t.strong))) r = { d, delta: t.pos - e, t }
        }
      return r
    }
    const bx = best([xs.l, xs.c, xs.r], tx)
    const by = best([ys.t, ys.c, ys.b], ty)
    this.guides = []
    if (bx) { o.set({ left: (o.left ?? 0) + bx.delta }); this.guides.push({ axis: 'x', pos: bx.t.pos, strong: bx.t.strong }) }
    if (by) { o.set({ top: (o.top ?? 0) + by.delta }); this.guides.push({ axis: 'y', pos: by.t.pos, strong: by.t.strong }) }
    this.keepInside(o)
    this.emit()
  }

  private renderGuides(ctx: CanvasRenderingContext2D, z: number) {
    const a = this.area
    if (this.bookmark) {
      // ligne de coupe du marque-page
      ctx.save()
      ctx.strokeStyle = 'rgba(201,168,76,.9)'
      ctx.lineWidth = 1.5 / z
      ctx.setLineDash([8 / z, 6 / z])
      ctx.beginPath(); ctx.moveTo(this.w / 2, 0); ctx.lineTo(this.w / 2, this.h); ctx.stroke()
      ctx.restore()
    }
    for (const g of this.guides) {
      ctx.save()
      ctx.strokeStyle = g.strong ? '#F2C12E' : 'rgba(124,92,255,.8)'
      ctx.lineWidth = (g.strong ? 1.5 : 1) / z
      ctx.setLineDash(g.strong ? [6 / z, 4 / z] : [])
      ctx.beginPath()
      if (g.axis === 'x') { ctx.moveTo(g.pos, a.top); ctx.lineTo(g.pos, a.bottom) } else { ctx.moveTo(a.left, g.pos); ctx.lineTo(a.right, g.pos) }
      ctx.stroke()
      ctx.restore()
    }
  }

  /** Moitié droite du marque-page = copie exacte des objets de la moitié gauche. */
  private renderMirror(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(this.w / 2, 0, this.w / 2, this.h)
    ctx.clip()
    ctx.translate(this.w / 2, 0)
    for (const o of this.objects) if (o.visible) o.render(ctx)
    ctx.restore()
  }
}
