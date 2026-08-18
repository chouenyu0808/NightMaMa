/**
 * 常用路徑 —— 存在 localStorage，讓使用者常走的路線下次能快速重複使用。
 */
export const FAVORITE_ROUTES_KEY = 'nightmama_favorite_routes'

export interface FavoriteRoute {
  id: string
  origin: string
  destination: string
  savedAt: number
}

export function loadFavoriteRoutes(): FavoriteRoute[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(FAVORITE_ROUTES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as FavoriteRoute[]) : []
  } catch {
    return []
  }
}

/** 同起訖點已存在就不重複加。 */
export function addFavoriteRoute(origin: string, destination: string): void {
  if (typeof window === 'undefined') return
  const existing = loadFavoriteRoutes()
  if (existing.some(r => r.origin === origin && r.destination === destination)) return
  const next = [...existing, { id: String(Date.now()), origin, destination, savedAt: Date.now() }]
  localStorage.setItem(FAVORITE_ROUTES_KEY, JSON.stringify(next))
}
