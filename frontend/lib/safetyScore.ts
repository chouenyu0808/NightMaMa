/**
 * 向後端取得路線的真實夜間安全評分。
 *
 * 資料來源是 backend/services/safety_scorer.py：沿路每 75 公尺切一段，
 * 各段以「照明 40% + CCTV 25% + 安全庇護點 35%」計分，整條路線取最差路段的分數
 * （一段暗巷不會被其他明亮路段平均掉）。路燈與 CCTV 來自 BigQuery 的
 * 台北市開放資料，超商與派出所來自 Google Places。
 */
import { encodePolyline, type RouteResult } from './maps'

interface ScoredRouteItem {
  score: number
  light_count: number
  camera_count: number
  police_count: number
  store_count: number
  segment_scores: number[]
  openness_avg: number | null
  reports_avg: number | null
}

export type ScoreStatus = 'ok' | 'unavailable'

export interface ScoreOutcome {
  status: ScoreStatus
  routes: RouteResult[]
  /** status 為 unavailable 時，給使用者看的說明 */
  message?: string
}

/**
 * 決定一條路線要送哪些 polyline 去評分。
 *
 * 步行路線就是整條。大眾運輸路線則「只送步行段」—— 搭車途中人在車上，
 * 公車行經的暗路不構成風險，但「取最差路段」會讓那段直接決定整條分數，
 * 使轉乘路線幾乎必然墊底。只評分實際暴露在街上的路段才有意義。
 *
 * 每個步行段各自送出而非串接成一條：兩段之間隔著整段車程，串起來會生出
 * 一條橫跨市區的假直線，那條線上的取樣點根本不在任何實際路徑上。
 */
function polylinesFor(route: RouteResult): string[] {
  if (!route.isTransit) {
    return route.polyline ? [route.polyline] : []
  }

  const walkLegs = (route.transitLegs ?? []).filter(
    l => l.mode === 'WALK' && l.points && l.points.length >= 2
  )
  return walkLegs.map(l => encodePolyline(l.points))
}

/** 把一條路線的多個步行段結果合成一筆。 */
function combine(items: ScoredRouteItem[]): ScoredRouteItem | null {
  if (!items.length) return null
  return {
    // 沿用後端「取最差路段」的語意：多個步行段之間也取最差的那段
    score: Math.min(...items.map(i => i.score)),
    light_count: items.reduce((s, i) => s + i.light_count, 0),
    camera_count: items.reduce((s, i) => s + i.camera_count, 0),
    police_count: items.reduce((s, i) => s + i.police_count, 0),
    store_count: items.reduce((s, i) => s + i.store_count, 0),
    segment_scores: items.flatMap(i => i.segment_scores),
    // 轉乘路線會有多個步行段，取平均的平均；任一段沒有資料就整體視為沒有
    openness_avg: items.every(i => i.openness_avg !== null)
      ? items.reduce((s, i) => s + (i.openness_avg ?? 0), 0) / items.length
      : null,
    reports_avg: items.every(i => i.reports_avg !== null)
      ? items.reduce((s, i) => s + (i.reports_avg ?? 0), 0) / items.length
      : null,
  }
}

/**
 * 把後端算出的安全數據併回路線陣列。
 *
 * 取不到評分時**不會**退回捏造的數字：回傳的路線 score 維持 null，
 * 由 UI 明確顯示「安全評分無法取得」。
 */
export async function attachSafetyScores(routes: RouteResult[]): Promise<ScoreOutcome> {
  if (!routes.length) return { status: 'ok', routes }

  // 攤平成一份請求，同時記住每條路線佔用哪幾個位置
  const polylines: string[] = []
  const spans: Array<{ start: number; count: number }> = []
  for (const r of routes) {
    const ps = polylinesFor(r)
    spans.push({ start: polylines.length, count: ps.length })
    polylines.push(...ps)
  }

  if (!polylines.length) {
    return { status: 'unavailable', routes, message: '路線資料不完整，無法計算安全評分' }
  }

  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ polylines }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      return {
        status: 'unavailable',
        routes,
        message: data?.error || `安全評分服務回應異常 (HTTP ${res.status})`,
      }
    }

    const data = await res.json()
    const scores: ScoredRouteItem[] = Array.isArray(data?.scores) ? data.scores : []

    if (scores.length !== polylines.length) {
      return { status: 'unavailable', routes, message: '安全評分回傳筆數不符' }
    }

    return {
      status: 'ok',
      routes: routes.map((r, i) => {
        const { start, count } = spans[i]
        const merged = combine(scores.slice(start, start + count))
        // 沒有任何可評分的路段（例如全程搭車）就維持 null，不要編一個分數
        if (!merged) return r
        return {
          ...r,
          score: merged.score,
          lightCount: merged.light_count,
          cameraCount: merged.camera_count,
          policeCount: merged.police_count,
          storeCount: merged.store_count,
          opennessAvg: merged.openness_avg,
          reportsAvg: merged.reports_avg,
          segmentScores: merged.segment_scores,
        }
      }),
    }
  } catch {
    return { status: 'unavailable', routes, message: '無法連線至安全評分服務' }
  }
}
