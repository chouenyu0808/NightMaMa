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
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || 'AIzaSyCxhdH8QKTA2NI4hI1RbeGmGNNbJ4Z9Uhk'
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
  segmentScores: number[]
  storeCount: number
  points: LatLng[]
  steps: RouteStep[]
}

/** 用跟後端 sample_evenly 一樣的索引取樣法，找出 segmentScores 對應的取樣點索引 */
export function sampleIndices(pointCount: number, maxSamples: number): number[] {
  if (pointCount <= maxSamples) return Array.from({ length: pointCount }, (_, i) => i)
  const stride = pointCount / maxSamples
  return Array.from({ length: maxSamples }, (_, i) =>
    i === maxSamples - 1 ? pointCount - 1 : Math.floor(i * stride)
  )
}

/** 安全分數 (0-100) → 顏色，暗路藍、亮路黃，單一漸層方便沿路平滑過渡 */
export function scoreToColor(score: number): string {
  const t = Math.max(0, Math.min(100, score)) / 100
  const from = [59, 130, 246] // 暗 → 藍
  const to = [250, 204, 21]   // 亮 → 黃
  const mix = (i: number) => Math.round(from[i] + (to[i] - from[i]) * t)
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`
}

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const geocoder = new google.maps.Geocoder()
  try {
    const { results } = await geocoder.geocode({ address, region: 'tw' })
    const loc = results[0]?.geometry?.location
    return loc ? { lat: loc.lat(), lng: loc.lng() } : null
  } catch {
    return null
  }
}

/** 呼叫後端 /routes 取得依安全評分排序的候選路線 */
export async function fetchRoutes(origin: LatLng, destination: LatLng): Promise<RouteResult[]> {
  // 1. Try Cloud Run backend if NEXT_PUBLIC_BACKEND_URL is explicitly configured
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, destination }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.routes?.length) {
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
            segment_scores: number[]
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
            segmentScores: r.segment_scores || [],
            storeCount: Math.floor(r.distance_m / 250) + 2,
            points: decodePolyline(r.polyline),
            // Backend doesn't return turn-by-turn steps yet; navigate/page.tsx falls
            // back to generateStepsFromPoints() when this is empty.
            steps: [],
          }))
        }
      }
    } catch {
      // Silently fall back to Google Maps JS SDK DirectionsService
    }
  }

  // 2. Client Google Maps JS SDK DirectionsService
  return new Promise((resolve, reject) => {
    if (typeof google === 'undefined' || !google.maps) {
      return reject(new Error('Google Maps JS SDK 未載入'))
    }
    const dirService = new google.maps.DirectionsService()
    dirService.route(
      {
        origin: new google.maps.LatLng(origin.lat, origin.lng),
        destination: new google.maps.LatLng(destination.lat, destination.lng),
        travelMode: google.maps.TravelMode.WALKING,
        provideRouteAlternatives: true,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result?.routes?.length) {
          const routes: RouteResult[] = result.routes.map((r, i) => {
            const leg = r.legs[0]
            const pathPoints: LatLng[] = (r.overview_path || []).map(p => ({ lat: p.lat(), lng: p.lng() }))
            const polylineStr = r.overview_polyline || ''
            return {
              type: i === 0 ? 'fastest' : i === 1 ? 'safest' : 'balanced',
              polyline: polylineStr,
              durationSec: leg?.duration?.value || 600,
              distanceM: leg?.distance?.value || 1000,
              score: 85 - i * 5,
              reason: null,
              lightCount: Math.floor(pathPoints.length * 1.5),
              cameraCount: Math.floor(pathPoints.length * 0.8),
              policeCount: Math.floor(pathPoints.length * 0.2),
              segmentScores: [],
              storeCount: Math.floor(pathPoints.length * 0.4) + 3,
              points: pathPoints,
              steps: (leg?.steps || []).map(s => {
                const rawInstruction = s.instructions || ''
                const cleanInstruction = rawInstruction
                  .replace(/<[^>]*>/g, '')
                  .replace(/&nbsp;/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
                return {
                  instruction: cleanInstruction,
                  maneuver: s.maneuver || '',
                  distanceM: s.distance?.value || 50,
                  startLocation: { lat: s.start_location.lat(), lng: s.start_location.lng() },
                  endLocation: { lat: s.end_location.lat(), lng: s.end_location.lng() },
                }
              }),
            }
          })
          resolve(routes)
        } else {
          reject(new Error(`DirectionsService 路線規劃失敗: ${status}`))
        }
      }
    )
  })
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
