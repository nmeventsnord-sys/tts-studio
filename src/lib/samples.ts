/**
 * Photos d'exemple posées dans les emplacements photo des templates, pour se projeter
 * (aperçus, galerie, éditeur). Purement visuel : le PNG envoyé garde ses trous transparents.
 * Photos Unsplash (licence Unsplash : usage commercial autorisé), dans public/exemples/.
 */
const BRIDES = ['mariage-nKcjbmB0Xhg', 'mariage-l0uf7VoUVjY', 'mariage-dtCFC0RMnQg', 'mariage-CHKW7YpLaJQ', 'mariage-V5ztZUM9gP8', 'mariage-5e882r559kI']
const PARTY = ['fete-Ehk94eNSk7Q', 'fete-eKFlLghqrXg', 'fete-XQu534-OKkM', 'fete-pFVyQPdx1rA']
const url = (n: string) => `/exemples/${n}.jpg`

/** Photos dans l'ordre d'utilisation pour une catégorie (mariées d'abord pour un mariage). */
export function samplePhotos(category?: string | null): string[] {
  const list = category === 'mariage' ? [...BRIDES, ...PARTY] : [...PARTY, ...BRIDES]
  return list.map(url)
}

export type Box = [number, number, number, number] // x0, y0, x1, y1 en fractions

/**
 * Photo de chaque emplacement : une différente par emplacement ; pour un marque-page double,
 * la bande de droite reprend la photo de l'emplacement correspondant à gauche.
 */
export function assignPhotos(boxes: Box[], photos: string[], bookmark = false): string[] {
  const out: string[] = []
  let n = 0
  const left = boxes.map((b, i) => ({ b, i })).filter(({ b }) => !bookmark || (b[0] + b[2]) / 2 < 0.5)
  for (const { i } of left) out[i] = photos[n++ % photos.length]
  if (bookmark)
    boxes.forEach((b, i) => {
      if (out[i]) return
      const twin = left.find(({ b: l }) => Math.abs(l[1] - b[1]) < 0.03 && Math.abs(l[0] + 0.5 - b[0]) < 0.06)
      out[i] = twin ? out[twin.i] : photos[n++ % photos.length]
    })
  return out
}

const cache = new Map<string, Promise<Box[]>>()

/**
 * Emplacements photo (zones transparentes) d'un PNG de template, calculés sur une version réduite.
 * Accepte une URL ou une image déjà chargée.
 */
export function findHoles(src: string | HTMLImageElement | HTMLCanvasElement): Promise<Box[]> {
  const key = typeof src === 'string' ? src : (src as HTMLImageElement).src ?? ''
  const hit = key && cache.get(key)
  if (hit) return hit
  const p = (async () => {
    let el: CanvasImageSource & { width: number; height: number }
    if (typeof src === 'string') {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = src
      await img.decode()
      el = img
    } else el = src
    const W = 200
    const H = Math.round((W * (el.height || 1)) / (el.width || 1))
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(el, 0, 0, W, H)
    const d = g.getImageData(0, 0, W, H).data
    const seen = new Uint8Array(W * H)
    const boxes: Box[] = []
    for (let p0 = 0; p0 < W * H; p0++) {
      if (seen[p0] || d[p0 * 4 + 3] > 24) continue
      let n = 0, x0 = W, x1 = 0, y0 = H, y1 = 0
      const stack = [p0]
      seen[p0] = 1
      while (stack.length) {
        const q = stack.pop()!
        n++
        const x = q % W
        const y = (q - x) / W
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        for (const r of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1])
          if (r >= 0 && !seen[r] && d[r * 4 + 3] <= 24) { seen[r] = 1; stack.push(r) }
      }
      if (n > W * H * 0.006) boxes.push([x0 / W, y0 / H, (x1 + 1) / W, (y1 + 1) / H])
    }
    // ordre de lecture : de haut en bas, puis de gauche à droite
    return boxes.sort((a, b) => (Math.abs(a[1] - b[1]) < 0.03 ? a[0] - b[0] : a[1] - b[1]))
  })()
  if (key) cache.set(key, p)
  p.catch(() => key && cache.delete(key))
  return p
}

const loaded = new Map<string, Promise<HTMLImageElement>>()
export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = loaded.get(url)
  if (!p) {
    p = new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url })
    loaded.set(url, p)
  }
  return p
}
