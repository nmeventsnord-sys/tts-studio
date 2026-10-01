import type { FormatKey, Theme, ThemeFormat } from '../lib/themes'

export type FormatInfo = { title: string; sub: string; bookmark?: boolean }

/** Libellés du prototype pour les formats des thèmes (ordre d'affichage compris). */
export const THEME_FORMATS: Record<FormatKey, FormatInfo> = {
  s4p: { title: 'Marque-page 4 photos', sub: '2×6 · imprimé en double', bookmark: true },
  s6p: { title: 'Marque-page 6 photos', sub: '2×6 · imprimé en double', bookmark: true },
  port1: { title: 'Portrait 1 photo', sub: '4×6 · photo + texte' },
  port2: { title: 'Portrait pleine page', sub: '4×6 · 1 grande photo' },
  land3: { title: 'Paysage 3 photos', sub: '6×4 · 3 vignettes' },
  land1: { title: 'Paysage 1 photo', sub: '6×4 · 1 grande photo' },
}
export const FORMAT_ORDER = Object.keys(THEME_FORMATS) as FormatKey[]

/** Formats de la création libre (clés reprises de l'existant : land, port, mark). */
export const FREE_FORMATS = {
  port: { w: 1200, h: 1800, title: 'Portrait 4×6', sub: '4×6 · vertical' },
  land: { w: 1800, h: 1200, title: 'Paysage 6×4', sub: '6×4 · horizontal' },
  mark: { w: 1200, h: 1800, title: 'Marque-page double', sub: '2×6 · imprimé en double', bookmark: true },
} as const
export type FreeFormatKey = keyof typeof FREE_FORMATS

/** Formats valides d'un thème, dans l'ordre du prototype puis les clés libres (custom1…). */
export function themeFormats(t: Theme): [string, ThemeFormat, FormatInfo][] {
  const f = t.fmts ?? {}
  const ok = (v?: ThemeFormat) => !!v?.src && v.w > 0 && v.h > 0
  const keys = [...FORMAT_ORDER.filter((k) => k in f), ...Object.keys(f).filter((k) => !(FORMAT_ORDER as string[]).includes(k))]
  return keys
    .map((k) => [k, (f as Record<string, ThemeFormat>)[k]] as const)
    .filter(([, v]) => ok(v))
    .map(([k, v]) => [k, v, THEME_FORMATS[k as FormatKey] ?? { title: v.lbl ?? k, sub: v.dim ?? `${v.w}×${v.h}`, bookmark: /bande|strip|2\s*[×x]\s*6/i.test(v.lbl ?? '') }])
}

/** Prénoms et date saisis par le client, repris dans les textes par défaut de l'éditeur. */
export type EventInfo = { names: string; date: string }
const INFO_KEY = 'tts-studio-info'
/** Vide = on garde les textes d'exemple du thème (ex. « Linda & William ») */
export const DEFAULT_INFO: EventInfo = { names: '', date: '' }
/** Textes d'exemple historiques (détection des textes non personnalisés avant envoi) */
export const SAMPLE_TEXTS = ['Sophie & Marc', '14 juin 2025']
export function readInfo(): EventInfo {
  try {
    const i = { ...DEFAULT_INFO, ...JSON.parse(localStorage.getItem(INFO_KEY) || '{}') }
    // anciennes valeurs par défaut enregistrées : on les oublie
    return { names: SAMPLE_TEXTS.includes(i.names) ? '' : i.names, date: SAMPLE_TEXTS.includes(i.date) ? '' : i.date }
  } catch { return DEFAULT_INFO }
}
export const saveInfo = (i: EventInfo) => localStorage.setItem(INFO_KEY, JSON.stringify(i))

/**
 * Texte à afficher pour un texte par défaut. Rôle connu (r) : les prénoms / la date saisis remplacent
 * ceux de l'exemple ; les autres textes du thème restent tels quels. Sans rôle (anciennes données) : déduction.
 */
export function defText(t: string, index: number, info: EventInfo, role?: 'names' | 'date' | 'other'): string {
  if (role === 'names') return info.names || t
  if (role === 'date') return info.date || t
  if (role === 'other') return t
  if (/sophie|&/i.test(t) || (index === 0 && !/d/.test(t))) return info.names || t
  if (/d{4}|juin|date/i.test(t) || index === 1) return info.date || t
  return t
}
