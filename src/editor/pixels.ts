/** Outils pixel (baguette, main magique, gomme) : fonctions pures sur ImageData. */

export type RGBA = [number, number, number, number]

/** Seuil de distance couleur à partir d'une tolérance 0-100 (même échelle que l'ancien Studio). */
export const threshold = (tol: number) => (tol / 100) * 160

const dist = (d: Uint8ClampedArray, i: number, c: RGBA) => {
  const dr = d[i] - c[0]
  const dg = d[i + 1] - c[1]
  const db = d[i + 2] - c[2]
  return Math.sqrt(dr * dr + dg * dg + db * db) + Math.abs(d[i + 3] - c[3]) * 0.5
}

export const pixelAt = (img: ImageData, x: number, y: number): RGBA => {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]
}

/**
 * Masque des pixels « acceptés » à partir d'un point.
 * contiguous = remplissage 4-voisins depuis le point ; sinon tous les pixels de l'image qui passent le test.
 */
export function floodMask(img: ImageData, sx: number, sy: number, accept: (d: Uint8ClampedArray, i: number) => boolean, contiguous = true): Uint8Array {
  const { width: W, height: H, data } = img
  const mask = new Uint8Array(W * H)
  if (!contiguous) {
    for (let p = 0; p < W * H; p++) if (accept(data, p * 4)) mask[p] = 1
    return mask
  }
  const stack = new Int32Array(W * H)
  let top = 0
  const start = sy * W + sx
  if (!accept(data, start * 4)) return mask
  stack[top++] = start
  mask[start] = 1
  while (top) {
    const p = stack[--top]
    const x = p % W
    const y = (p - x) / W
    const next = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]
    for (const n of next) {
      if (n < 0 || mask[n]) continue
      if (accept(data, n * 4)) { mask[n] = 1; stack[top++] = n }
    }
  }
  return mask
}

/** Baguette : pixels proches de la couleur cliquée. */
export function wandMask(img: ImageData, x: number, y: number, tol: number, contiguous: boolean) {
  const seed = pixelAt(img, x, y)
  const t = threshold(tol)
  return floodMask(img, x, y, (d, i) => dist(d, i, seed) <= t, contiguous)
}

/** Efface (transparence) les pixels du masque, avec une frange adoucie d'un pixel. */
export function eraseMask(img: ImageData, mask: Uint8Array) {
  const { width: W, height: H, data } = img
  for (let p = 0; p < W * H; p++) if (mask[p]) data[p * 4 + 3] = 0
  for (let p = 0; p < W * H; p++) {
    if (mask[p]) continue
    const x = p % W
    const near = (x > 0 && mask[p - 1]) || (x < W - 1 && mask[p + 1]) || (p >= W && mask[p - W]) || (p < W * (H - 1) && mask[p + W])
    if (near) data[p * 4 + 3] = Math.round(data[p * 4 + 3] * 0.5)
  }
}

/** Couleur dominante (quantifiée) des pixels opaques : le « fond » du design. */
export function dominantColor(img: ImageData): RGBA {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>()
  const d = img.data
  for (let i = 0; i < d.length; i += 16) {
    if (d[i + 3] < 200) continue
    const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)
    const c = counts.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
    c.n++; c.r += d[i]; c.g += d[i + 1]; c.b += d[i + 2]
    counts.set(k, c)
  }
  let best = { n: 0, r: 255, g: 255, b: 255 }
  for (const c of counts.values()) if (c.n > best.n) best = c
  return best.n ? [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n), 255] : [255, 255, 255, 255]
}

/**
 * Main magique : le motif cliqué = pixels connectés qui se distinguent du fond dominant
 * (les zones transparentes du template servent de frontière).
 */
export function elementMask(img: ImageData, x: number, y: number, tol: number) {
  const bg = dominantColor(img)
  const t = threshold(tol)
  const mask = floodMask(img, x, y, (d, i) => d[i + 3] > 24 && dist(d, i, bg) > t, true)
  return { mask, bg }
}

export function maskBounds(mask: Uint8Array, W: number) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, n = 0
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue
    const x = p % W
    const y = (p - x) / W
    n++
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return n ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, n } : null
}

/** Dilate un masque de r pixels (pour recouvrir les franges lors du rebouchage). */
export function dilate(mask: Uint8Array, W: number, H: number, r: number) {
  let cur = mask
  for (let k = 0; k < r; k++) {
    const next = cur.slice()
    for (let p = 0; p < W * H; p++) {
      if (cur[p]) continue
      const x = p % W
      if ((x > 0 && cur[p - 1]) || (x < W - 1 && cur[p + 1]) || (p >= W && cur[p - W]) || (p < W * (H - 1) && cur[p + W])) next[p] = 1
    }
    cur = next
  }
  return cur
}

export function toCanvas(img: ImageData) {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  c.getContext('2d')!.putImageData(img, 0, 0)
  return c
}

export const canvasBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Export image impossible'))), 'image/png'))

/** Pixels d'une source (image ou canvas) à sa taille naturelle. */
export function readPixels(src: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}
