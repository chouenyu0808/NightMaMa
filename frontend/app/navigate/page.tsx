'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { loadMaps, decodePolyline, formatDuration, formatDistance, fetchRoutes, type RouteResult, type RouteStep } from '@/lib/maps'
import { searchNearbySafetyPlaces, drawSafetyPlaceMarkers, drawAnxietyReportMarkers } from '@/lib/safetyPlaces'
import AnxietyReportModal from '@/app/components/AnxietyReportModal'
import SosOptionsSheet from '@/app/components/SosOptionsSheet'
import ArrivalRatingModal from '@/app/components/ArrivalRatingModal'
import {
  IconCompass, IconVolume2, IconVolumeX, IconTarget, IconMap, IconMic, IconAlertTriangle,
  IconCornerUpRight, IconCornerUpLeft, IconArrowUp, IconFlag, IconSparkles, IconX,
  IconSos, IconLoader, IconStore, IconRoute,
} from '@/components/Icons'
import { CompanionContent } from '@/app/companion/page'

type ManeuverIcon = 'right' | 'left' | 'slight-right' | 'slight-left' | 'uturn' | 'straight' | 'destination'

interface NavStep {
  instruction: string
  distanceM: number
  maneuver: string
  streetName: string
  icon: ManeuverIcon
}

function getManeuverIcon(maneuver: string): ManeuverIcon {
  const m = maneuver.toUpperCase()
  if (m.includes('UTURN')) return 'uturn'
  if (m.includes('SLIGHT_RIGHT') || m.includes('BEAR_RIGHT')) return 'slight-right'
  if (m.includes('SLIGHT_LEFT') || m.includes('BEAR_LEFT')) return 'slight-left'
  if (m.includes('RIGHT')) return 'right'
  if (m.includes('LEFT')) return 'left'
  return 'straight'
}

function StepIcon({ icon, size = 24, color = 'currentColor' }: { icon: ManeuverIcon; size?: number; color?: string }) {
  switch (icon) {
    case 'right':
    case 'slight-right':
    case 'uturn':
      return <IconCornerUpRight size={size} color={color} />
    case 'left':
    case 'slight-left':
      return <IconCornerUpLeft size={size} color={color} />
    case 'destination':
      return <IconFlag size={size} color={color} />
    default:
      return <IconArrowUp size={size} color={color} />
  }
}

function parseStreetName(instruction: string): string {
  // Extract street name from "Turn right onto X" or "向右轉進入莊敬路"
  const clean = instruction.replace(/<[^>]*>/g, '') // remove HTML tags if any
  const matchTw = clean.match(/(?:進入|朝|往)([^，,\s]+)/)
  if (matchTw) return matchTw[1]
  const matchEn = clean.match(/(?:onto|on)\s+([^,]+)/i)
  if (matchEn) return matchEn[1]
  return clean.slice(0, 16) || '目的地路段'
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function calculateHeading(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2Rad)
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)
  const brng = Math.atan2(y, x) * 180 / Math.PI
  return (brng + 360) % 360
}

/**
 * 解析 `bus=上車lat,上車lng,下車lat,下車lng` 參數，換算成 polyline 上的索引區間。
 *
 * 傳座標而不是索引，是因為 page.tsx 手上的搭車路段點位來自 transitLegs，
 * 與整條 overview polyline 的取樣點並非一一對應，用最近點對齊比較可靠。
 *
 * 參數不存在或格式不對就回傳 null，呼叫端會把整條路線當成步行處理。
 */
function parseBusRange(
  param: string | null,
  points: Array<{ lat: number; lng: number }>
): { start: number; end: number } | null {
  if (!param || points.length < 2) return null
  const nums = param.split(',').map(Number)
  if (nums.length !== 4 || nums.some(n => !Number.isFinite(n))) return null

  const [startLat, startLng, endLat, endLng] = nums
  const nearest = (lat: number, lng: number) => {
    let best = 0
    let bestD = Infinity
    points.forEach((p, i) => {
      const d = haversineMeters(lat, lng, p.lat, p.lng)
      if (d < bestD) { bestD = d; best = i }
    })
    return best
  }

  const start = nearest(startLat, startLng)
  const end = nearest(endLat, endLng)
  // 對齊後若順序顛倒或長度為零，代表對不上這條 polyline，寧可當成步行
  if (end <= start) return null
  return { start, end }
}

function generateStepsFromPoints(points: Array<{ lat: number; lng: number }>, destination: string): NavStep[] {
  if (points.length < 2) {
    return [{ instruction: `前往 ${destination}`, distanceM: 100, maneuver: 'STRAIGHT', streetName: destination, icon: 'straight' }]
  }

  const generated: NavStep[] = []
  let accumulatedDist = 0

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    const dist = haversineMeters(p1.lat, p1.lng, p2.lat, p2.lng)
    accumulatedDist += dist

    if (i === 0) {
      generated.push({
        instruction: `出發，沿著夜間高照明道路前進`,
        distanceM: Math.round(dist),
        maneuver: 'STRAIGHT',
        streetName: '起點路段',
        icon: 'straight',
      })
      continue
    }

    if (i < points.length - 1) {
      const h1 = calculateHeading(points[i - 1].lat, points[i - 1].lng, p1.lat, p1.lng)
      const h2 = calculateHeading(p1.lat, p1.lng, p2.lat, p2.lng)
      let diff = h2 - h1
      if (diff > 180) diff -= 360
      if (diff < -180) diff += 360

      if (Math.abs(diff) > 25 || accumulatedDist > 220) {
        let maneuver = 'STRAIGHT'
        let icon: ManeuverIcon = 'straight'
        let turnName = '直行前進'

        if (diff >= 25 && diff < 110) {
          maneuver = 'TURN_RIGHT'
          icon = 'right'
          turnName = '右轉'
        } else if (diff <= -25 && diff > -110) {
          maneuver = 'TURN_LEFT'
          icon = 'left'
          turnName = '左轉'
        } else if (diff >= 110) {
          maneuver = 'SLIGHT_RIGHT'
          icon = 'slight-right'
          turnName = '斜右轉'
        } else if (diff <= -110) {
          maneuver = 'SLIGHT_LEFT'
          icon = 'slight-left'
          turnName = '斜左轉'
        }

        generated.push({
          instruction: `${turnName}，繼續步行 ${Math.round(accumulatedDist)} 公尺`,
          distanceM: Math.round(accumulatedDist),
          maneuver,
          streetName: `${turnName}路段`,
          icon,
        })
        accumulatedDist = 0
      }
    }
  }

  generated.push({
    instruction: `抵達目的地：${destination}`,
    distanceM: 0,
    maneuver: 'DESTINATION',
    streetName: destination.split('區')[1] || destination,
    icon: 'destination',
  })

  return generated
}

function NavigateContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<google.maps.Map | null>(null)
  const userMarkerRef = useRef<google.maps.Marker | null>(null)
  const polylineRef = useRef<google.maps.Polyline | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const prevPosRef = useRef<{ lat: number; lng: number } | null>(null)
  const routePointsRef = useRef<Array<{ lat: number; lng: number }>>([])
  const safetyMarkersRef = useRef<google.maps.Marker[]>([])

  const polylineStr = searchParams.get('polyline') || ''
  const origin = searchParams.get('origin') || '出發地'
  const destination = searchParams.get('destination') || '目的地'
  const durationSec = parseInt(searchParams.get('duration') || '600')
  const distanceM = parseInt(searchParams.get('distance') || '950')
  // 後端評分取不到時 page.tsx 不會帶 safety 參數，這裡就維持 null，
  // 不要用 85 之類的預設值假裝有評分。
  const safetyParam = searchParams.get('safety')
  const safetyScore = safetyParam === null || safetyParam === '' ? null : Number.parseInt(safetyParam, 10)

  const [remainingSec, setRemainingSec] = useState(durationSec)
  const [realtimeDistanceM, setRealtimeDistanceM] = useState(distanceM)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [steps, setSteps] = useState<NavStep[]>([])
  const [showStepsDrawer, setShowStepsDrawer] = useState(false)
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [isCentering, setIsCentering] = useState(true)
  const [showSafetyPlaces, setShowSafetyPlaces] = useState(false)
  const [isLoadingSafetyPlaces, setIsLoadingSafetyPlaces] = useState(false)
  const [showAnxietyModal, setShowAnxietyModal] = useState(false)
  const [showSosSheet, setShowSosSheet] = useState(false)

  // 抵達判定：進入目的地 40m 內就跳出回報/評分視窗。
  // 用 ref 記住是否已經跳過，避免在目的地附近來回走動時重複彈出。
  const [showArrival, setShowArrival] = useState(false)
  const hasArrivedRef = useRef(false)

  // ─── Split Screen AI Companion (body is the shared CompanionContent component) ─
  const [showCompanionSplit, setShowCompanionSplit] = useState(false)

  // 超商/警局標記改成按需查詢，不用一進導航頁就自動打 Places API
  const toggleSafetyPlaces = useCallback(async () => {
    if (showSafetyPlaces) {
      safetyMarkersRef.current.forEach(m => m.setMap(null))
      safetyMarkersRef.current = []
      setShowSafetyPlaces(false)
      return
    }
    if (!mapInstance.current || !routePointsRef.current.length) return
    setIsLoadingSafetyPlaces(true)
    try {
      const places = await searchNearbySafetyPlaces(mapInstance.current, routePointsRef.current)
      if (mapInstance.current) {
        safetyMarkersRef.current = drawSafetyPlaceMarkers(mapInstance.current, places)
        setShowSafetyPlaces(true)
      }
    } finally {
      setIsLoadingSafetyPlaces(false)
    }
  }, [showSafetyPlaces])

  // ETA 由計時器算好存進 state。先前是在 render 期間直接呼叫 Date.now()，
  // 那是不純的：同一份 state 在不同次 render 會得到不同結果。
  const [etaTime, setEtaTime] = useState('')

  // Speech output for turns
  const speakInstruction = useCallback((text: string) => {
    if (voiceMuted || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'zh-TW'
    utt.rate = 1.0
    window.speechSynthesis.speak(utt)
  }, [voiceMuted])

  // Timer countdown（順便更新抵達時刻）
  useEffect(() => {
    const formatEta = (secondsLeft: number) =>
      new Date(Date.now() + secondsLeft * 1000).toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })

    const t = setInterval(() => {
      setRemainingSec(r => {
        const next = Math.max(0, r - 1)
        setEtaTime(formatEta(next))
        return next
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // Map initialization & GPS tracking
  useEffect(() => {
    loadMaps().then(() => {
      if (!mapRef.current) return
      const points = decodePolyline(polylineStr)
      if (!points.length) return

      // Parse steps from query param or generate from polyline points
      let parsedSteps: NavStep[] = []
      const stepsParam = searchParams.get('steps')
      if (stepsParam) {
        try {
          const raw = JSON.parse(stepsParam) as RouteStep[]
          if (Array.isArray(raw) && raw.length > 0) {
            parsedSteps = raw.map(s => ({
              instruction: s.instruction,
              distanceM: s.distanceM,
              maneuver: s.maneuver,
              streetName: parseStreetName(s.instruction),
              icon: getManeuverIcon(s.maneuver),
            }))
          }
        } catch {}
      }

      if (parsedSteps.length < 2) {
        parsedSteps = generateStepsFromPoints(points, destination)
      }
      setSteps(parsedSteps)

      mapInstance.current = new google.maps.Map(mapRef.current, {
        center: points[0],
        zoom: 18.3,
        heading: 0,
        disableDefaultUI: true,
        gestureHandling: 'greedy',
        styles: googleNavMapStyle,
      })

      // 搭車區間由 page.tsx 以 `bus=上車lat,上車lng,下車lat,下車lng` 傳入，
      // 只有大眾運輸路線才會有這個參數。
      //
      // 先前這裡不看路線種類，一律把 polyline 切成 25% / 50% / 25%，
      // 把中間半條畫成藍色公車線並插上站牌圖示 —— 使用者明明選了步行，
      // 地圖上卻出現一段公車路線。導航頁只收到一條 polyline 字串，
      // 根本無從得知是不是大眾運輸，所以那段切割純粹是憑空編的。
      const busRange = parseBusRange(searchParams.get('bus'), points)

      const walk1 = busRange ? points.slice(0, busRange.start + 1) : points
      const bus = busRange ? points.slice(busRange.start, busRange.end + 1) : []
      const walk2 = busRange ? points.slice(busRange.end) : []

      // Leg 1: Walk to Bus Stop (Safety Evaluation & Green Shields)
      if (walk1.length >= 2) {
        new google.maps.Polyline({
          path: walk1,
          map: mapInstance.current!,
          strokeColor: '#10b981',
          strokeWeight: 9,
          strokeOpacity: 0.95,
          zIndex: 10,
        })
        const midIdx = Math.floor(walk1.length / 2)
        if (walk1[midIdx]) {
          new google.maps.Marker({
            position: walk1[midIdx],
            map: mapInstance.current!,
            title: busRange ? '🛡️ 步行至公車站夜間安全防護段' : '🛡️ 夜間安全防護路段',
            icon: {
              url: 'data:image/svg+xml;utf8,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="26" viewBox="0 0 24 24" fill="#065f46" stroke="#10b981" stroke-width="2">' +
                '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
                '<path d="M9 12l2 2 4-4" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>'
              ),
              scaledSize: new google.maps.Size(24, 26),
              anchor: new google.maps.Point(12, 13),
            },
            zIndex: 30,
          })
        }
      }

      // Leg 2: Bus Ride (Transit Line #0284c7 - No safety colors needed inside vehicle)
      if (bus.length >= 2) {
        new google.maps.Polyline({
          path: bus,
          map: mapInstance.current!,
          strokeColor: '#0284c7',
          strokeWeight: 9,
          strokeOpacity: 0.95,
          zIndex: 15,
        })

        // Bus Stop Markers
        new google.maps.Marker({
          position: bus[0],
          map: mapInstance.current!,
          title: '🚏 上車公車站',
          icon: {
            url: 'data:image/svg+xml;utf8,' + encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#0284c7" stroke="#ffffff" stroke-width="2">' +
              '<rect x="3" y="3" width="18" height="15" rx="3"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/><path d="M12 6h.01"/>' +
              '</svg>'
            ),
            scaledSize: new google.maps.Size(28, 28),
            anchor: new google.maps.Point(14, 14),
          },
          zIndex: 35,
        })
        new google.maps.Marker({
          position: bus[bus.length - 1],
          map: mapInstance.current!,
          title: '🚏 下車公車站 (準備夜間步行回家)',
          icon: {
            url: 'data:image/svg+xml;utf8,' + encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#0284c7" stroke="#ffffff" stroke-width="2">' +
              '<rect x="3" y="3" width="18" height="15" rx="3"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/><path d="M12 6h.01"/>' +
              '</svg>'
            ),
            scaledSize: new google.maps.Size(28, 28),
            anchor: new google.maps.Point(14, 14),
          },
          zIndex: 35,
        })
      }

      // Leg 3: Walk from Bus Stop to Destination (Safety Evaluation & Green Shields)
      if (walk2.length >= 2) {
        new google.maps.Polyline({
          path: walk2,
          map: mapInstance.current!,
          strokeColor: '#10b981',
          strokeWeight: 9,
          strokeOpacity: 0.95,
          zIndex: 10,
        })
        const midIdx = Math.floor(walk2.length / 2)
        if (walk2[midIdx]) {
          new google.maps.Marker({
            position: walk2[midIdx],
            map: mapInstance.current!,
            title: '🛡️ 下車步行回家夜間安全防護段',
            icon: {
              url: 'data:image/svg+xml;utf8,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="26" viewBox="0 0 24 24" fill="#065f46" stroke="#10b981" stroke-width="2">' +
                '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
                '<path d="M9 12l2 2 4-4" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>'
              ),
              scaledSize: new google.maps.Size(24, 26),
              anchor: new google.maps.Point(12, 13),
            },
            zIndex: 30,
          })
        }
      }

      // Destination Marker
      new google.maps.Marker({
        position: points[points.length - 1],
        map: mapInstance.current!,
        title: destination,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: '#ef4444',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
      })

      routePointsRef.current = points
      const infoWindow = new google.maps.InfoWindow()

      // Draw community reported anxiety hotspots
      drawAnxietyReportMarkers(mapInstance.current!, infoWindow).catch(console.error)

      let currentPoints = points

      // GPS watch position with dynamic route line clipping & rerouting
      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          pos => {
            const current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            const heading = pos.coords.heading || 0
            setUserPos(current)

            // Dynamic distance recalculation to destination
            const destPoint = currentPoints[currentPoints.length - 1]
            const remainingM = Math.round(haversineMeters(current.lat, current.lng, destPoint.lat, destPoint.lng))
            setRealtimeDistanceM(remainingM)
            setRemainingSec(Math.round(remainingM / 1.25)) // 1.25 m/s walking speed

            // 抵達目的地 40m 內視為已抵達。取 40m 是因為手機 GPS 在
            // 市區的誤差通常就有 10-20m，門檻太小會一直觸發不了。
            if (remainingM <= 40 && !hasArrivedRef.current) {
              hasArrivedRef.current = true
              setShowArrival(true)
            }

            // Find closest route point index
            let minIndex = 0
            let minDistance = Infinity

            currentPoints.forEach((p, idx) => {
              const d = haversineMeters(current.lat, current.lng, p.lat, p.lng)
              if (d < minDistance) {
                minDistance = d
                minIndex = idx
              }
            })

            // If user strays > 35m off route, trigger dynamic reroute from current position
            if (minDistance > 35) {
              fetchRoutes(current, destPoint).then((newRoutes: RouteResult[]) => {
                if (newRoutes.length && mapInstance.current) {
                  currentPoints = newRoutes[0].points
                  polylineRef.current?.setPath([current, ...currentPoints])
                }
              }).catch(console.error)
            } else {
              // Dynamically clip remaining route path from current location
              const remainingPath = [current, ...currentPoints.slice(minIndex)]
              polylineRef.current?.setPath(remainingPath)
            }

            // Calculate movement heading to align map facing UP
            const userHeading =
              pos.coords.heading ||
              (prevPosRef.current
                ? calculateHeading(prevPosRef.current.lat, prevPosRef.current.lng, current.lat, current.lng)
                : 0)
            prevPosRef.current = current

            // User location blue navigation arrow
            if (!userMarkerRef.current) {
              userMarkerRef.current = new google.maps.Marker({
                position: current,
                map: mapInstance.current!,
                title: '我的位置',
                icon: {
                  path: 'M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z',
                  fillColor: '#0066FF',
                  fillOpacity: 1,
                  scale: 1.6,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 2,
                  rotation: userHeading,
                  anchor: new google.maps.Point(12, 12),
                },
                zIndex: 200,
              })
            } else {
              userMarkerRef.current.setPosition(current)
              const icon = userMarkerRef.current.getIcon() as google.maps.Symbol
              if (icon) {
                icon.rotation = userHeading
                userMarkerRef.current.setIcon(icon)
              }
            }

            if (isCentering && mapInstance.current) {
              mapInstance.current.panTo(current)
              if (userHeading) {
                mapInstance.current.setHeading(userHeading)
                mapInstance.current.setTilt(45)
              }
            }
          },
          null,
          { enableHighAccuracy: true }
        )
      }

      // Initial camera view — start directly in close-up tracking view (zoom 18.3 on user start position)
      if (mapInstance.current && points[0]) {
        mapInstance.current.setCenter(points[0])
        mapInstance.current.setZoom(18.3)
      }
    })

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)
      mapInstance.current = null
    }
  }, [polylineStr, destination, distanceM, isCentering])

  const recenterMap = () => {
    setIsCentering(true)
    if (userPos && mapInstance.current) {
      mapInstance.current.panTo(userPos)
      mapInstance.current.setZoom(18.3)
    }
  }

  const currentStep = steps[currentStepIdx] || {
    icon: 'straight' as ManeuverIcon,
    streetName: destination,
    instruction: `前往 ${destination}`,
    distanceM: distanceM,
  }

  const nextStep = steps[currentStepIdx + 1]

  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: '#0a0e1a' }}>
      {/* Map view */}
      <div
        ref={mapRef}
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: showCompanionSplit ? '62dvh' : '100dvh',
          transition: 'height 0.3s ease-in-out',
        }}
      />

      {/* ─── Top Floating Google Navigation Banner (Transparent Glassmorphism) ───── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        zIndex: 50,
        padding: '48px 12px 0',
        pointerEvents: 'none',
      }}>
        {/* Main Turn Banner */}
        <div style={{
          background: 'rgba(2, 44, 34, 0.92)',
          backdropFilter: 'blur(16px)',
          borderRadius: 20,
          padding: '14px 18px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
          border: '1px solid rgba(16,185,129,0.4)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          pointerEvents: 'auto',
        }}>
          {/* Big direction icon */}
          <div style={{
            fontSize: 34,
            width: 50,
            height: 50,
            borderRadius: 14,
            background: 'rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <StepIcon icon={currentStep.icon} size={28} color="white" />
          </div>

          {/* Turn text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
              前往
            </div>
            <div style={{
              fontSize: 20,
              fontWeight: 900,
              color: '#ffffff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '0.01em',
            }}>
              {currentStep.streetName}
            </div>
          </div>
        </div>

        {/* Secondary "Next step" Sub-banner */}
        {nextStep && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            marginLeft: 6,
            padding: '5px 12px',
            background: 'rgba(1, 51, 40, 0.9)',
            backdropFilter: 'blur(12px)',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.9)',
            fontSize: 12,
            fontWeight: 700,
            pointerEvents: 'auto',
          }}>
            <span>接下來</span>
            <StepIcon icon={nextStep.icon} size={14} />
            <span>{nextStep.streetName}</span>
          </div>
        )}
      </div>

      {/* ─── Right Floating Control Column (Google Maps Floating Icons) ───────── */}
      <div style={{
        position: 'absolute', right: 14, top: '190px',
        display: 'flex', flexDirection: 'column', gap: 10,
        zIndex: 40,
      }}>
        {/* Compass Button */}
        <button
          onClick={recenterMap}
          style={floatingControlStyle}
          title="指北針"
        >
          <IconCompass size={20} color="white" />
        </button>

        {/* Voice Announcements Toggle */}
        <button
          onClick={() => {
            const nextMuted = !voiceMuted
            setVoiceMuted(nextMuted)
            if (!nextMuted) speakInstruction(currentStep.instruction)
          }}
          style={{
            ...floatingControlStyle,
            background: voiceMuted ? 'rgba(239,68,68,0.2)' : 'rgba(17,24,39,0.85)',
            borderColor: voiceMuted ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.15)',
          }}
          title={voiceMuted ? '開啟語音播報' : '靜音'}
        >
          {voiceMuted ? <IconVolumeX size={20} color="#ef4444" /> : <IconVolume2 size={20} color="white" />}
        </button>

        {/* Recenter Map Button */}
        <button
          onClick={recenterMap}
          style={{
            ...floatingControlStyle,
            color: isCentering ? '#3b82f6' : 'white',
            borderColor: isCentering ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.15)',
          }}
          title="重新對焦我的位置"
        >
          <IconTarget size={20} color={isCentering ? '#3b82f6' : 'white'} />
        </button>

        {/* Safety Places Toggle (store/police markers — fetched on demand) */}
        <button
          onClick={toggleSafetyPlaces}
          disabled={isLoadingSafetyPlaces}
          style={{
            ...floatingControlStyle,
            background: showSafetyPlaces ? 'rgba(16,185,129,0.25)' : 'rgba(17,24,39,0.85)',
            borderColor: showSafetyPlaces ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.15)',
            opacity: isLoadingSafetyPlaces ? 0.6 : 1,
          }}
          title={showSafetyPlaces ? '隱藏超商/警局' : '顯示附近超商/警局'}
        >
          {isLoadingSafetyPlaces ? <IconLoader size={20} color="white" className="spin" /> : <IconStore size={20} color="white" />}
        </button>
      </div>

      {/* ─── Bottom Google Navigation Bar (ETA Card) — Hidden when AI Companion is Open ─── */}
      {!showCompanionSplit && (
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          zIndex: 50,
          padding: '0 12px 16px',
          pointerEvents: 'none',
        }}>
          <div style={{
            background: 'rgba(15,23,42,0.92)',
            borderRadius: 22,
            padding: '12px 16px',
            border: '1px solid rgba(255,255,255,0.15)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 10px 35px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            pointerEvents: 'auto',
          }}>
          {/* Main Info Line */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* End Navigation Button */}
            <button
              onClick={() => router.push('/')}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#ef4444',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="結束導航"
            >
              <IconX size={18} color="#ef4444" />
            </button>

            {/* ETA Info Center */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#10b981', lineHeight: 1 }}>
                {formatDuration(remainingSec)}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4, fontWeight: 500 }}>
                {formatDistance(realtimeDistanceM)} · 預計 {etaTime} 抵達
              </div>
            </div>

            {/* Steps list toggle button */}
            <button
              onClick={() => setShowStepsDrawer(!showStepsDrawer)}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: showStepsDrawer ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)',
                border: showStepsDrawer ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.15)',
                color: 'white',
                fontSize: 20,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="詳細路線"
            >
              <IconMap size={20} color="white" />
            </button>
          </div>

          {/* Quick Action Buttons Row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-primary"
              style={{
                flex: 1, padding: '12px 6px',
                background: showCompanionSplit ? 'linear-gradient(135deg, #a855f7, #6366f1)' : 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                border: showCompanionSplit ? '1px solid #c084fc' : 'none',
                boxShadow: showCompanionSplit ? '0 0 16px rgba(168,85,247,0.6)' : 'none',
              }}
              onClick={() => {
                const nextState = !showCompanionSplit
                setShowCompanionSplit(nextState)
                setTimeout(() => {
                  if (mapInstance.current) {
                    google.maps.event.trigger(mapInstance.current, 'resize')
                  }
                }, 320)
              }}
            >
              <IconMic size={15} /> {showCompanionSplit ? '收起陪聊' : 'AI 陪聊'}
            </button>
            <button
              className="btn-primary"
              style={{ flex: 1, padding: '12px 6px', background: '#dc2626', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => setShowAnxietyModal(true)}
            >
              <IconAlertTriangle size={15} color="white" /> 不安通報
            </button>
            <button
              className="btn-primary btn-danger"
              style={{ flex: 1, padding: '12px 6px', animation: 'none', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => setShowSosSheet(true)}
            >
              <IconSos size={15} color="white" /> SOS
            </button>
          </div>
        </div>
      </div>
      )}

      {/* ─── Split Screen AI Companion Chat Drawer (Bottom 52dvh) ───────────── */}
      {showCompanionSplit && (
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: '52dvh',
          zIndex: 60,
          background: '#8cabd0',
          borderTop: '2px solid rgba(255, 255, 255, 0.4)',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.3s ease-out'
        }}>
          {/* ─── 1. Navigation Live Activity "Now Bar" (Dynamic Island / Now Bar Style) ─── */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.98), rgba(15, 23, 42, 0.98))',
            borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            zIndex: 10,
          }}>
            {/* Left: Live Pulsing Green Dot + Navigation Status + Time/Dist */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#10b981', boxShadow: '0 0 8px #10b981',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: '#34d399', whiteSpace: 'nowrap' }}>導航中</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'white', whiteSpace: 'nowrap' }}>{formatDuration(remainingSec)}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>({formatDistance(realtimeDistanceM)})</span>
            </div>

            {/* Right: ETA + SOS Pill Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>
                預計 <strong style={{ color: '#60a5fa' }}>{etaTime}</strong> 抵達
              </span>
              <button
                onClick={() => setShowSosSheet(true)}
                style={{
                  background: '#dc2626', border: '1px solid rgba(248,113,113,0.4)', color: 'white',
                  borderRadius: 12, padding: '3px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(220,38,38,0.4)', whiteSpace: 'nowrap'
                }}
              >
                <IconSos size={12} color="white" /> SOS
              </button>
            </div>
          </div>

          {/* ─── Shared Authentic LINE-Style AI Companion Component ─── */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <CompanionContent
              embeddedInNav={true}
              onCloseNav={() => {
                setShowCompanionSplit(false)
                setTimeout(() => {
                  if (mapInstance.current) {
                    google.maps.event.trigger(mapInstance.current, 'resize')
                  }
                }, 320)
              }}
              routeContext={{
                origin,
                destination,
                safetyScore,
                durationSec: remainingSec,
              }}
            />
          </div>
        </div>
      )}

      {/* 導航中的 SOS 選項面板 */}
      <SosOptionsSheet
        isOpen={showSosSheet}
        onClose={() => setShowSosSheet(false)}
        currentPos={userPos}
        destination={destination}
      />

      {/* 抵達目的地後的平安回報與路線評分 */}
      <ArrivalRatingModal
        isOpen={showArrival}
        onClose={() => setShowArrival(false)}
        origin={origin}
        destination={destination}
        routeType={searchParams.get('type') || '步行'}
        safetyScore={safetyScore}
        distanceM={distanceM}
      />

      {/* Anxiety Report Modal */}
      <AnxietyReportModal
        isOpen={showAnxietyModal}
        onClose={() => setShowAnxietyModal(false)}
        currentPos={userPos || undefined}
        onReportSuccess={() => {
          if (mapInstance.current) {
            const infoWindow = new google.maps.InfoWindow()
            drawAnxietyReportMarkers(mapInstance.current, infoWindow).catch(() => {})
          }
        }}
      />

      {/* ─── Turn-by-Turn Steps Drawer Modal ─────────────────────────────────── */}
      {showStepsDrawer && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(10,14,26,0.95)',
          backdropFilter: 'blur(20px)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          padding: '52px 20px 24px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}><IconRoute size={22} /> 轉彎路線指引</div>
            <button onClick={() => setShowStepsDrawer(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex' }}><IconX size={24} color="white" /></button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }} className="scrollable">
            {steps.map((step, idx) => (
              <div
                key={idx}
                style={{
                  padding: 16,
                  borderRadius: 16,
                  background: idx === currentStepIdx ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                  border: idx === currentStepIdx ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <div style={{ width: 40, display: 'flex', justifyContent: 'center' }}><StepIcon icon={step.icon} size={26} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{step.instruction.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{formatDistance(step.distanceM)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const floatingControlStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: '50%',
  background: 'rgba(17,24,39,0.85)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: 'white',
  fontSize: 20,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
}

// Google Navigation style map — standard, natural (green) colors
const googleNavMapStyle: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f2' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4b5563' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e5e7eb' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fde68a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#a5d8e8' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#d4ecd0' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#a8d5a2' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#eef3e8' }] },
]

export default function NavigatePage() {
  return (
    <Suspense fallback={<div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>載入導航中…</div>}>
      <NavigateContent />
    </Suspense>
  )
}
