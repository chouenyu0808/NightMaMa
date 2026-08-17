/**
 * Google Maps 路線載入與解析工具
 */
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

export interface LatLng {
  lat: number
  lng: number
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

let loaderConfigured = false
let mapsReady = false

export async function loadMaps(): Promise<typeof google.maps> {
  if (mapsReady && typeof google !== 'undefined' && google.maps) return google.maps
  if (!loaderConfigured) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!apiKey) {
      throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_KEY 未設定，請在 frontend/.env.local 填入')
    }
    setOptions({
      key: apiKey,
      v: 'weekly',
    })
    loaderConfigured = true
  }
  await importLibrary('maps')
  await importLibrary('places')
  await importLibrary('geometry')
  mapsReady = true
  return google.maps
}

/** 解碼 polyline 字串為 LatLng 陣列 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let b: number
    let shift = 0
    let result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dlat

    shift = 0
    result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlng = result & 1 ? ~(result >> 1) : result >> 1
    lng += dlng

    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}

export interface RouteStep {
  instruction: string
  maneuver: string
  distanceM: number
  startLocation: LatLng
  endLocation: LatLng
}

export interface RouteResult {
  type: string // "fastest" | "safest" | "balanced"
  polyline: string
  durationSec: number
  distanceM: number
  score: number
  reason: string | null
  lightCount: number
  cameraCount: number
  policeCount: number
  points: LatLng[]
  steps: RouteStep[]
}

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const geocoder = new google.maps.Geocoder()
  const { results } = await geocoder.geocode({ address, region: 'tw' })
  const loc = results[0]?.geometry?.location
  return loc ? { lat: loc.lat(), lng: loc.lng() } : null
}

/** 呼叫後端 /routes 取得依安全評分排序的候選路線 */
export async function fetchRoutes(origin: LatLng, destination: LatLng): Promise<RouteResult[]> {
  const res = await fetch(`${BACKEND_URL}/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination }),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.detail || data.error || `路線 API 錯誤 (${res.status})`)
  }

  if (!data.routes?.length) {
    throw new Error('找不到路線，請確認地址名稱')
  }

  return (data.routes as Array<{
    type: string
    polyline: string
    duration_min: number
    distance_m: number
    score: number
    reason: string | null
    light_count: number
    camera_count: number
    police_count: number
  }>).map((r) => ({
    type: r.type,
    polyline: r.polyline,
    durationSec: Math.round(r.duration_min * 60),
    distanceM: r.distance_m,
    score: r.score,
    reason: r.reason,
    lightCount: r.light_count,
    cameraCount: r.camera_count,
    policeCount: r.police_count,
    points: decodePolyline(r.polyline),
    // Backend doesn't return turn-by-turn steps yet; navigate/page.tsx falls
    // back to generateStepsFromPoints() when this is empty.
    steps: [],
  }))
}

/** 格式化時間 */
export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} 分鐘`
  return `${Math.floor(m / 60)} 小時 ${m % 60} 分鐘`
}

/** 格式化距離 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} 公尺`
  return `${(meters / 1000).toFixed(1)} 公里`
}
