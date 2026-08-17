/**
 * 向後端取得路線的真實夜間安全評分。
 *
 * 資料來源是 backend/services/safety_scorer.py：沿路每 75 公尺切一段，
 * 各段以「照明 40% + CCTV 25% + 安全庇護點 35%」計分，整條路線取最差路段的分數
 * （一段暗巷不會被其他明亮路段平均掉）。路燈與 CCTV 來自 BigQuery 的
 * 台北市開放資料，超商與派出所來自 Google Places。
 */
import type { RouteResult } from './maps'

interface ScoredRouteItem {
  score: number
  light_count: number
  camera_count: number
  police_count: number
  store_count: number
  segment_scores: number[]
}

export type ScoreStatus = 'ok' | 'unavailable'

export interface ScoreOutcome {
  status: ScoreStatus
  routes: RouteResult[]
  /** status 為 unavailable 時，給使用者看的說明 */
  message?: string
}

/**
 * 把後端算出的安全數據併回路線陣列。
 *
 * 取不到評分時**不會**退回捏造的數字：回傳的路線 score 維持 null，
 * 由 UI 明確顯示「安全評分無法取得」。
 */
export async function attachSafetyScores(routes: RouteResult[]): Promise<ScoreOutcome> {
  if (!routes.length) return { status: 'ok', routes }

  const polylines = routes.map(r => r.polyline)
  if (polylines.some(p => !p)) {
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

    if (scores.length !== routes.length) {
      return { status: 'unavailable', routes, message: '安全評分回傳筆數不符' }
    }

    return {
      status: 'ok',
      routes: routes.map((r, i) => ({
        ...r,
        score: scores[i].score,
        lightCount: scores[i].light_count,
        cameraCount: scores[i].camera_count,
        policeCount: scores[i].police_count,
        storeCount: scores[i].store_count,
        segmentScores: scores[i].segment_scores ?? [],
      })),
    }
  } catch {
    return { status: 'unavailable', routes, message: '無法連線至安全評分服務' }
  }
}
