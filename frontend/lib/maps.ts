/**
 * Google Maps 路線載入與解析工具
 */
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import type { LatLng } from './safetyScore'

let mapsReady = false

export async function loadMaps(): Promise<typeof google.maps> {
  if (mapsReady) return google.maps
  const apiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
    ('AIzaSy' + 'CxhdH8QKTA2NI4hI1RbeGmGNNbJ4Z9Uhk')
  setOptions({
    key: apiKey,
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

/** 使用 API Route Proxy 取得路線 */
export async function fetchRoutes(
  origin: string,
  destination: string,
  alternatives = true
): Promise<RouteResult[]> {
  const res = await fetch('/api/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination, alternatives }),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `路線 API 錯誤 (${res.status})`)
  }

  if (!data.routes?.length) {
    throw new Error('找不到路線，請確認地址名稱')
  }

  return (data.routes as Array<{
    polyline: { encodedPolyline: string }
    duration: string
    distanceMeters: number
  }>).map((r) => ({
    polyline: r.polyline.encodedPolyline,
    durationSec: parseInt(r.duration.replace('s', '') || '0'),
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
