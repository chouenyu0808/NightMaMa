/**
 * Google Maps 路線載入與解析工具
 */
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

export interface LatLng {
  lat: number
  lng: number
}

let loaderConfigured = false
let mapsReady = false

export async function loadMaps(): Promise<typeof google.maps> {
  if (mapsReady && typeof google !== 'undefined' && google.maps) return google.maps
  if (!loaderConfigured) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!apiKey) {
      throw new Error(
        '缺少 NEXT_PUBLIC_GOOGLE_MAPS_KEY。請在 frontend/.env.local 設定後重新啟動 dev server。'
      )
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

/** 把 LatLng 陣列編碼回 Google polyline 字串（decodePolyline 的反向）。 */
export function encodePolyline(points: LatLng[]): string {
  const encodeValue = (v: number): string => {
    let value = v < 0 ? ~(v << 1) : v << 1
    let out = ''
    while (value >= 0x20) {
      out += String.fromCharCode((0x20 | (value & 0x1f)) + 63)
      value >>= 5
    }
    out += String.fromCharCode(value + 63)
    return out
  }

  let result = ''
  let prevLat = 0
  let prevLng = 0
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5)
    const lng = Math.round(p.lng * 1e5)
    result += encodeValue(lat - prevLat) + encodeValue(lng - prevLng)
    prevLat = lat
    prevLng = lng
  }
  return result
}

export interface RouteStep {
  instruction: string
  maneuver: string
  distanceM: number
  startLocation: LatLng
  endLocation: LatLng
}

export interface TransitLeg {
  mode: 'WALK' | 'BUS'
  lineName?: string
  departureStop?: string
  arrivalStop?: string
  points: LatLng[]
}

/**
 * 真實安全評分，來自後端 /score（BigQuery 路燈 + CCTV + Places 安全庇護點）。
 *
 * 全部欄位可為 null，代表「尚未取得」或「後端不可用」。這裡刻意不提供預設值：
 * 先前的版本用 `pathPoints.length * 1.5` 之類的公式捏造路燈數與分數，
 * 對安全性 App 來說，顯示一個編造的安全分數比顯示「無法取得」危險得多。
 */
export interface RouteResult {
  type: string // "fastest" | "safest" | "balanced" | "transit"
  polyline: string
  durationSec: number
  distanceM: number
  reason: string | null
  /** null = 尚未取得真實評分 */
  score: number | null
  lightCount: number | null
  cameraCount: number | null
  policeCount: number | null
  storeCount: number | null
  segmentScores: number[]
  points: LatLng[]
  steps: RouteStep[]
  isTransit?: boolean
  transitLegs?: TransitLeg[]
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

/** 呼叫 Google Directions API 取得依安全評分與大眾運輸排序的候選路線 */
export async function fetchRoutes(
  originInput: string | LatLng,
  destInput: string | LatLng
): Promise<RouteResult[]> {
  // 1. Client Google Maps JS SDK DirectionsService
  return new Promise((resolve, reject) => {
    if (typeof google === 'undefined' || !google.maps) {
      return reject(new Error('Google Maps JS SDK 未載入'))
    }
    const dirService = new google.maps.DirectionsService()

    const originParam = typeof originInput === 'string'
      ? originInput
      : new google.maps.LatLng(originInput.lat, originInput.lng)

    const destParam = typeof destInput === 'string'
      ? destInput
      : new google.maps.LatLng(destInput.lat, destInput.lng)

    dirService.route(
      {
        origin: originParam,
        destination: destParam,
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
              // 這裡只是候選路線的暫時代號；真正的「最安全 / 最快」
              // 要等後端評分回來後才由 page.tsx 決定。
              type: 'candidate',
              polyline: polylineStr,
              durationSec: leg?.duration?.value || 600,
              distanceM: leg?.distance?.value || 1000,
              reason: null,
              // 安全數據一律留空，等 attachSafetyScores() 從後端補上
              score: null,
              lightCount: null,
              cameraCount: null,
              policeCount: null,
              storeCount: null,
              segmentScores: [],
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

          // Query Real Google Maps Directions TRANSIT Mode for true bus / MRT lines and stop names!
          // We pass provideRouteAlternatives: true to get multiple transit candidates
          dirService.route(
            {
              origin: originParam,
              destination: destParam,
              travelMode: google.maps.TravelMode.TRANSIT,
              provideRouteAlternatives: true,
            },
            (transitRes, transitStatus) => {
              if (transitStatus === google.maps.DirectionsStatus.OK && transitRes?.routes?.length) {
                // Get the true destination point from the walking route overview_path
                const walkingTargetPt = routes[0]?.points?.[routes[0]?.points?.length - 1]

                // Iterate candidate transit routes from Google to find a usable transit route
                for (const tr of transitRes.routes) {
                  const tLeg = tr.legs[0]
                  if (!tLeg) continue

                  const transitLegs: TransitLeg[] = []
                  const steps: RouteStep[] = []

                  let mainLineName = ''

                  ;(tLeg.steps || []).forEach((s) => {
                    const sPts: LatLng[] = (s.path || []).map(p => ({ lat: p.lat(), lng: p.lng() }))
                    if (s.transit) {
                      const lName = s.transit.line?.short_name || s.transit.line?.name || '公車/大眾運輸'
                      const depStop = s.transit.departure_stop?.name || '轉乘站'
                      const arrStop = s.transit.arrival_stop?.name || '下車站'

                      if (!mainLineName) {
                        mainLineName = lName
                      }

                      transitLegs.push({
                        mode: 'BUS',
                        lineName: lName,
                        departureStop: depStop,
                        arrivalStop: arrStop,
                        points: sPts,
                      })

                      // Omit intermediate bus stops - single clean transit step!
                      steps.push({
                        instruction: `🚌 在「${depStop}」搭乘 [${lName}] 到「${arrStop}」下車`,
                        maneuver: 'straight',
                        distanceM: s.distance?.value || 500,
                        startLocation: { lat: s.start_location.lat(), lng: s.start_location.lng() },
                        endLocation: { lat: s.end_location.lat(), lng: s.end_location.lng() },
                      })
                    } else {
                      // WALKING leg - provide ALL detailed turn-by-turn walking steps!
                      transitLegs.push({
                        mode: 'WALK',
                        points: sPts,
                      })

                      const walkSubSteps = s.steps && s.steps.length > 0 ? s.steps : [s]
                      walkSubSteps.forEach((subStep) => {
                        const rawIns = subStep.instructions || ''
                        const cleanIns = rawIns
                          .replace(/<[^>]*>/g, '')
                          .replace(/&nbsp;/g, ' ')
                          .replace(/\s+/g, ' ')
                          .trim()

                        if (cleanIns) {
                          steps.push({
                            instruction: `🚶 ${cleanIns}`,
                            maneuver: subStep.maneuver || 'turn-straight',
                            distanceM: subStep.distance?.value || 50,
                            startLocation: { lat: subStep.start_location.lat(), lng: subStep.start_location.lng() },
                            endLocation: { lat: subStep.end_location.lat(), lng: subStep.end_location.lng() },
                          })
                        }
                      })
                    }
                  })

                  // Common sense validation:
                  // 1. Must contain at least one transit vehicle leg (BUS / MRT)
                  // 2. The final transit vehicle alighting stop MUST be within 1200m of the TRUE target destination!
                  const busLegs = transitLegs.filter(l => l.mode === 'BUS' && l.points && l.points.length > 0)
                  if (!busLegs.length) continue

                  const lastBus = busLegs[busLegs.length - 1]
                  const lastStopPt = lastBus.points[lastBus.points.length - 1]

                  let distFromLastStopToDest = 0
                  if (walkingTargetPt) {
                    const R = 6371000
                    const dLat = (walkingTargetPt.lat - lastStopPt.lat) * Math.PI / 180
                    const dLon = (walkingTargetPt.lng - lastStopPt.lng) * Math.PI / 180
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lastStopPt.lat * Math.PI / 180) * Math.cos(walkingTargetPt.lat * Math.PI / 180) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2)
                    distFromLastStopToDest = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
                  }

                  // If alighting stop is > 1200m away from the true destination, skip this bad route option!
                  if (distFromLastStopToDest > 1200) {
                    continue
                  }

                  const allBusLines = busLegs.map(b => b.lineName).filter(Boolean)
                  const busSummary = allBusLines.join(' ➔ ')
                  const firstDep = busLegs[0]?.departureStop || '上車站'
                  const finalArr = busLegs[busLegs.length - 1]?.arrivalStop || '下車站'

                  const walkLegs = transitLegs.filter(l => l.mode === 'WALK')
                  const totalWalkDistM = walkLegs.reduce((sum, l) => {
                    if (!l.points || l.points.length < 2) return sum
                    let d = 0
                    for (let k = 1; k < l.points.length; k++) {
                      const R2 = 6371000
                      const dLa = (l.points[k].lat - l.points[k-1].lat) * Math.PI / 180
                      const dLo = (l.points[k].lng - l.points[k-1].lng) * Math.PI / 180
                      const aa = Math.sin(dLa/2)*Math.sin(dLa/2) + Math.cos(l.points[k-1].lat*Math.PI/180)*Math.cos(l.points[k].lat*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2)
                      d += R2 * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa))
                    }
                    return sum + d
                  }, 0)

                  const realTransitRoute: RouteResult = {
                    type: 'transit',
                    isTransit: true,
                    transitLegs,
                    polyline: tr.overview_polyline || '',
                    durationSec: tLeg?.duration?.value || 600,
                    distanceM: tLeg?.distance?.value || 1000,
                    reason: `搭乘 ${busSummary || '大眾運輸'}（${firstDep} 上車 ➔ ${finalArr} 下車），步行段約 ${Math.round(totalWalkDistM)} 公尺`,
                    // 轉乘路線的安全評分同樣交給後端計算：整條 polyline 都會被
                    // 評分，其中搭車路段本來就會落在有路燈的道路上。
                    score: null,
                    lightCount: null,
                    cameraCount: null,
                    policeCount: null,
                    storeCount: null,
                    segmentScores: [],
                    points: (tr.overview_path || []).map(p => ({ lat: p.lat(), lng: p.lng() })),
                    steps,
                  }
                  routes.push(realTransitRoute)
                  break // Found a valid, common-sense transit route! Stop looping.
                }
              }
              resolve(routes)
            }
          )
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
