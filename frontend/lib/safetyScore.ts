/**
 * 安全評分引擎
 * 依路燈密度、CCTV 密度計算路線安全分數
 */

export interface LatLng {
  lat: number
  lng: number
}

export interface Light {
  lat: number
  lng: number
  watt: number
  qty: number
}

export interface CCTV {
  lat: number
  lng: number
  name: string
  dist: string
}

export interface RouteSegment {
  points: LatLng[]
}

export interface SafetyScore {
  total: number          // 0-100
  lightScore: number     // 0-100
  cctvScore: number      // 0-100
  placeScore: number     // 0-100
  lightCount: number
  cctvCount: number
  label: '安全' | '普通' | '注意'
  color: string
  emoji: string
}

/** Haversine 距離 (公尺) */
export function distance(a: LatLng, b: LatLng): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const c =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng *
      sinDLng
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c))
}

/** 沿路線採樣點（每隔 30m 一個） */
export function sampleRoutePoints(polyline: LatLng[], intervalM = 30): LatLng[] {
  if (polyline.length < 2) return polyline
  const samples: LatLng[] = [polyline[0]]
  let accumulated = 0

  for (let i = 1; i < polyline.length; i++) {
    const d = distance(polyline[i - 1], polyline[i])
    accumulated += d
    if (accumulated >= intervalM) {
      samples.push(polyline[i])
      accumulated = 0
    }
  }
  samples.push(polyline[polyline.length - 1])
  return samples
}

/** 計算樣本點半徑 radiusM 內的燈具數與亮度 */
export function countNearbyLights(
  samples: LatLng[],
  lights: Light[],
  radiusM = 50
): { count: number; totalWatt: number } {
  let count = 0
  let totalWatt = 0
  const seen = new Set<number>()

  for (const sample of samples) {
    for (let i = 0; i < lights.length; i++) {
      if (seen.has(i)) continue
      if (distance(sample, lights[i]) <= radiusM) {
        seen.add(i)
        count += lights[i].qty
        totalWatt += lights[i].watt * lights[i].qty
      }
    }
  }
  return { count, totalWatt }
}

/** 計算樣本點半徑 radiusM 內的 CCTV 數 */
export function countNearbyCCTV(
  samples: LatLng[],
  cctvs: CCTV[],
  radiusM = 80
): number {
  const seen = new Set<number>()
  for (const sample of samples) {
    for (let i = 0; i < cctvs.length; i++) {
      if (seen.has(i)) continue
      if (distance(sample, cctvs[i]) <= radiusM) seen.add(i)
    }
  }
  return seen.size
}

/** 綜合安全評分 (權重: 超商 40% > 警察局 30% > 路燈 20% > 監視器 10%) */
export function calcSafetyScore(
  samples: LatLng[],
  lights: Light[],
  cctvs: CCTV[],
  storeCount = 0,
  policeCount = 0
): SafetyScore {
  const routeLengthKm = (samples.length * 30) / 1000 || 1
  const { count: lightCount } = countNearbyLights(samples, lights)
  const cctvCount = countNearbyCCTV(samples, cctvs)

  // 每公里密度標準化 (滿分基準: 超商 3/km, 警局 1/km, 路燈 120/km, CCTV 18/km)
  const storeDensity = (storeCount || 2) / routeLengthKm
  const policeDensity = (policeCount || 1) / routeLengthKm
  const lightDensity = lightCount / routeLengthKm
  const cctvDensity = cctvCount / routeLengthKm

  const storeScore = Math.min(100, Math.round((storeDensity / 3) * 100))
  const policeScore = Math.min(100, Math.round((policeDensity / 1) * 100))
  const lightScore = Math.min(100, Math.round((lightDensity / 120) * 100))
  const cctvScore = Math.min(100, Math.round((cctvDensity / 18) * 100))

  // 加權總分: 超商 40% + 警察局 30% + 路燈 20% + 監視器 10%
  let rawTotal =
    storeScore * 0.40 +
    policeScore * 0.30 +
    lightScore * 0.20 +
    cctvScore * 0.10

  // 實體防禦加成 (有 24h 超商或警察局加分)
  if (storeCount >= 2) rawTotal += 3
  if (policeCount >= 1) rawTotal += 4

  const total = Math.min(99, Math.max(30, Math.round(rawTotal)))

  let label: SafetyScore['label']
  let color: string
  let emoji: string
  if (total >= 85) {
    label = '安全'
    color = '#10b981'
    emoji = '🟢'
  } else if (total >= 60) {
    label = '普通'
    color = '#f59e0b'
    emoji = '🟡'
  } else {
    label = '注意'
    color = '#ef4444'
    emoji = '🔴'
  }

  return {
    total,
    lightScore,
    cctvScore,
    placeScore: storeScore,
    lightCount,
    cctvCount,
    label,
    color,
    emoji,
  }
}
