/**
 * Photos d'exemple posées dans les emplacements photo des templates, pour se projeter
 * (aperçus, galerie, éditeur). Purement visuel : le PNG envoyé garde ses trous transparents.
 * Photos Unsplash (licence Unsplash : usage commercial autorisé), dans public/exemples/.
 */
const COUPLES = ['couple-AD3k4pko7wo', 'couple-fNIfLGQGfi8', 'couple-Tk-a9GSBBJA', 'couple-YsTrevaOoqU']
const BRIDES = ['mariage-nKcjbmB0Xhg', 'mariage-l0uf7VoUVjY', 'mariage-dtCFC0RMnQg', 'mariage-CHKW7YpLaJQ', 'mariage-V5ztZUM9gP8', 'mariage-5e882r559kI']
const PARTY = ['fete-Ehk94eNSk7Q', 'fete-eKFlLghqrXg', 'fete-XQu534-OKkM', 'fete-pFVyQPdx1rA']
const url = (n: string) => `/exemples/${n}.jpg`

/**
 * Photos d'exemple d'une catégorie, la première étant celle à montrer : couples pour un mariage,
 * groupes pour une fête. Le `seed` (slug du thème) varie la photo d'un thème à l'autre.
 */
export function samplePhotos(category?: string | null, seed?: string | null): string[] {
  const base = category === 'mariage' ? [...COUPLES, ...BRIDES, ...PARTY] : [...PARTY, ...COUPLES, ...BRIDES]
  const pool = category === 'mariage' ? COUPLES.length : PARTY.length
  let h = 0
  for (const ch of seed ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const n = h % pool
  return [...base.slice(n, pool), ...base.slice(0, n), ...base.slice(pool)].map(url)
}

export type Box = [number, number, number, number] // x0, y0, x1, y1 en fractions

/** Photo de chaque emplacement : la même partout, comme sur les exemples des vendeurs. */
export function assignPhotos(boxes: Box[], photos: string[], _bookmark = false): string[] {
  return boxes.map(() => photos[0])
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
    // masque transparent rogné d'1 px (liserés autour des photos, comme le script d'ingestion)
    const raw = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) raw[i] = d[i * 4 + 3] <= 24 ? 1 : 0
    const mask = raw.slice()
    for (let i = 0; i < W * H; i++) {
      if (!raw[i]) continue
      const x = i % W
      if (x === 0 || x === W - 1 || i < W || i >= W * (H - 1) || !raw[i - 1] || !raw[i + 1] || !raw[i - W] || !raw[i + W]) mask[i] = 0
    }
    const seen = new Uint8Array(W * H)
    const boxes: Box[] = []
    for (let p0 = 0; p0 < W * H; p0++) {
      if (seen[p0] || !mask[p0]) continue
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
          if (r >= 0 && !seen[r] && mask[r]) { seen[r] = 1; stack.push(r) }
      }
      if (n > W * H * 0.006) boxes.push([Math.max(0, x0 - 1) / W, Math.max(0, y0 - 1) / H, Math.min(W, x1 + 2) / W, Math.min(H, y1 + 2) / H])
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
