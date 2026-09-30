/**
 * Images ajoutées par le client.
 * Elles ne sont PAS stockées en base64 dans le projet (défaut de l'existant : JSON énorme,
 * 30 copies dans l'historique). Chaque image reçoit un identifiant (srcKey), le fichier est gardé
 * dans IndexedDB (survit au rechargement, y compris pour un invité) et envoyé dans Storage à la sauvegarde.
 */

const DB = 'tts-studio'
const STORE = 'assets'
const MAX_SIDE = 2400 // au-delà, inutile pour une impression 6×4 à 300 dpi
const urls = new Map<string, string>()

function db(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => ko(r.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((ok, ko) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => ok(req.result)
    req.onerror = () => ko(req.error)
  })
}

/** Réduit les très grandes images et garde la transparence (PNG) quand il y en a. */
async function normalize(file: Blob): Promise<Blob> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  if (k === 1 && file.size < 6_000_000) { bmp.close(); return file }
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  const png = file.type === 'image/png' || file.type === 'image/webp'
  return new Promise((ok) => c.toBlob((b) => ok(b ?? file), png ? 'image/png' : 'image/jpeg', 0.92))
}

/** Enregistre une image et renvoie { key, url } (url = blob: utilisable par Fabric). */
export async function putAsset(file: Blob): Promise<{ key: string; url: string }> {
  if (!file.type.startsWith('image/')) throw new Error("Ce fichier n'est pas une image.")
  const blob = await normalize(file)
  const key = crypto.randomUUID()
  await idb('readwrite', (s) => s.put(blob, key))
  const url = URL.createObjectURL(blob)
  urls.set(key, url)
  return { key, url }
}

/** Remplace une image existante (gomme, baguette, détourage) sous une nouvelle clé. */
export const putEditedAsset = (blob: Blob) => putAsset(new File([blob], 'image.png', { type: blob.type || 'image/png' }))

export async function getAssetBlob(key: string): Promise<Blob | undefined> {
  return idb<Blob | undefined>('readonly', (s) => s.get(key) as IDBRequest<Blob | undefined>)
}

/** URL affichable d'une image : blob: si elle est encore sur cet appareil. */
export async function assetUrl(key: string): Promise<string | undefined> {
  const cached = urls.get(key)
  if (cached) return cached
  const b = await getAssetBlob(key)
  if (!b) return undefined
  const url = URL.createObjectURL(b)
  urls.set(key, url)
  return url
}
