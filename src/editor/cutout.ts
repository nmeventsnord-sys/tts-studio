/**
 * Détourage IA (suppression du fond d'une photo) avec @imgly/background-removal.
 * Le modèle (~40 Mo) est téléchargé une seule fois puis gardé en cache par le navigateur ;
 * tout se passe dans le navigateur, aucune image n'est envoyée à un serveur.
 */
export async function removeBackgroundAI(src: Blob, onProgress: (pct: number) => void): Promise<Blob> {
  const { removeBackground } = await import('@imgly/background-removal')
  return removeBackground(src, {
    output: { format: 'image/png' },
    progress: (key: string, current: number, total: number) => {
      if (key.startsWith('fetch') && total) onProgress(Math.round((current / total) * 100))
    },
  })
}
