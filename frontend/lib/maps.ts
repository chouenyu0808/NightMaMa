/**
 * Google Maps 路線載入與解析工具
 */
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import type { LatLng } from './safetyScore'

let mapsReady = false

export async function loadMaps(): Promise<typeof google.maps> {
  if (mapsReady) return google.maps
  setOptions({
    key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!,
    v: 'weekly',
  })
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

export interface RouteResult {
  polyline: string
  durationSec: number
  distanceM: number
  points: LatLng[]
}

/** 使用 Routes API (REST) 取得路線 */
export async function fetchRoutes(
  origin: string,
  destination: string,
  alternatives = true
): Promise<RouteResult[]> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!

  // NOTE: routingPreference & routeModifiers are NOT allowed with travelMode=WALK
  const body = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode: 'WALK',
    computeAlternativeRoutes: alternatives,
    languageCode: 'zh-TW',
    units: 'METRIC',
  }

  const res = await fetch(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const msg = errBody?.error?.message || errBody?.message || `HTTP ${res.status}`
    throw new Error(`路線 API 錯誤：${msg}`)
  }

  const data = await res.json()
  if (!data.routes?.length) throw new Error('找不到路線，請確認地址是否正確')

  return (data.routes as Array<{
    polyline: { encodedPolyline: string }
    duration: string
    distanceMeters: number
  }>).map((r) => ({
    polyline: r.polyline.encodedPolyline,
    durationSec: parseInt(r.duration.replace('s', '')),
    distanceM: r.distanceMeters,
    points: decodePolyline(r.polyline.encodedPolyline),
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
