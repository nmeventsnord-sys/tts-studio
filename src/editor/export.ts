import type { FabricObject } from 'fabric'
import type { EditorObject, StudioEditor } from './engine'

/**
 * PNG d'impression, exactement w × h px.
 * Les prises de vue sont des trous transparents : chaque zone efface ce qui a été dessiné
 * SOUS elle (fond, images), mais pas ce qui est posé au-dessus (un texte sur la photo reste visible).
 * Marque-page : la bande de droite reçoit la même composition que la gauche.
 */
export function renderPrint(ed: StudioEditor): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = ed.w
  c.height = ed.h
  const ctx = c.getContext('2d')!
  // Fabric saute les objets hors écran : sans ça, un design zoomé perdrait des éléments à l'export.
  const skip = ed.canvas.skipOffscreen
  ed.canvas.skipOffscreen = false
  try {
    if (ed.canvas.backgroundImage) renderFull(ed.canvas.backgroundImage, ctx)
    drawPasses(ed, ctx)
  } finally {
    ed.canvas.skipOffscreen = skip
  }
  return c
}

function drawPasses(ed: StudioEditor, ctx: CanvasRenderingContext2D) {
  const pass = (offsetX: number) => {
    ctx.save()
    if (offsetX) {
      ctx.beginPath()
      ctx.rect(offsetX, 0, ed.w - offsetX, ed.h)
      ctx.clip()
      ctx.translate(offsetX, 0)
    }
    for (const o of ed.objects) {
      if (!o.visible) continue
      if (o.role === 'zone') punch(ctx, o)
      else renderFull(o, ctx)
    }
    ctx.restore()
  }
  pass(0)
  if (ed.bookmark) pass(ed.w / 2)
}

/** Rendu direct, sans le cache d'écran (basse résolution) : netteté d'impression. */
function renderFull(o: FabricObject, ctx: CanvasRenderingContext2D) {
  const cached = o.objectCaching
  o.objectCaching = false
  try { o.render(ctx) } finally { o.objectCaching = cached; o.dirty = true }
}

/** Efface la forme de la zone (rotation comprise). */
function punch(ctx: CanvasRenderingContext2D, z: FabricObject & EditorObject) {
  const m = z.calcTransformMatrix()
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5])
  ctx.fillStyle = '#000'
  ctx.fillRect(-z.width / 2, -z.height / 2, z.width, z.height)
  ctx.restore()
}

/** Plan annoté (JPEG, fond blanc) : zones rouges numérotées visibles, pour Time To Smile et le client. */
export function renderPlan(ed: StudioEditor, maxSide = 1600): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(ed.w, ed.h))
  const src = ed.renderNative({ multiplier: k })
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(src, 0, 0)
  return c
}

export const toBlob = (c: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', q = 0.85) =>
  new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Export impossible'))), type, q))

export type PdfInfo = { prenom: string; nom: string; template: string; format: string; planDataUrl: string; zones: number }

/** PDF récapitulatif pour le client (A4, bandeau Time To Smile, plan annoté). */
export async function downloadPdf(info: PdfInfo) {
  const { jsPDF } = await import('jspdf')
  const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = info.planDataUrl })
  const landscape = img.width > img.height
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()

  doc.setFillColor(12, 40, 48)
  doc.rect(0, 0, W, 27, 'F')
  doc.setFillColor(242, 193, 46)
  doc.rect(0, 27, W, 1.2, 'F')
  doc.setTextColor(242, 193, 46)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('TIME TO SMILE · STUDIO', 14, 10)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15)
  doc.text('Ton template personnalisé', 14, 19)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(159, 176, 182)
  doc.text(`${info.prenom} ${info.nom} · ${info.template} · ${info.format}`.trim(), W - 14, 19, { align: 'right' })

  const top = 36
  const bottom = 26
  const maxW = W - 28
  const maxH = H - top - bottom
  const k = Math.min(maxW / img.width, maxH / img.height)
  const w = img.width * k
  const h = img.height * k
  const x = (W - w) / 2
  doc.addImage(img, 'JPEG', x, top, w, h)
  doc.setDrawColor(230, 226, 218)
  doc.rect(x, top, w, h)

  doc.setFontSize(9)
  doc.setTextColor(107, 116, 120)
  const note = info.zones
    ? `Les ${info.zones} zone${info.zones > 1 ? 's' : ''} rouge${info.zones > 1 ? 's' : ''} numérotée${info.zones > 1 ? 's' : ''} montrent où la borne placera tes photos (dans l'ordre des prises de vue). Elles n'apparaîtront pas à l'impression.`
    : 'Les emplacements des photos sont ceux prévus par le template.'
  doc.text(doc.splitTextToSize(note, W - 28), 14, H - 16)
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} · timetosmile.fr`, W - 14, H - 8, { align: 'right' })
  const safe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '')
  doc.save(`Time-To-Smile-${safe(info.prenom) || 'template'}-${safe(info.nom)}.pdf`.replace(/-\.pdf$/, '.pdf'))
}
