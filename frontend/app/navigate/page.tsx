'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { loadMaps, decodePolyline, formatDuration, formatDistance, fetchRoutes, type RouteResult, type RouteStep } from '@/lib/maps'
import { searchNearbySafetyPlaces, drawSafetyPlaceMarkers, drawAnxietyReportMarkers } from '@/lib/safetyPlaces'
import AnxietyReportModal from '@/app/components/AnxietyReportModal'

interface NavStep {
  instruction: string
  distanceM: number
  maneuver: string
  streetName: string
  icon: string
}

function getManeuverIcon(maneuver: string): string {
  const m = maneuver.toUpperCase()
  if (m.includes('RIGHT')) return '↱'
  if (m.includes('LEFT')) return '↰'
  if (m.includes('SLIGHT_RIGHT') || m.includes('BEAR_RIGHT')) return '⬏'
  if (m.includes('SLIGHT_LEFT') || m.includes('BEAR_LEFT')) return '⬎'
  if (m.includes('UTURN')) return '↰↰'
  return '⬆️'
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
  let brng = Math.atan2(y, x) * 180 / Math.PI
  return (brng + 360) % 360
}

function generateStepsFromPoints(points: Array<{ lat: number; lng: number }>, destination: string): NavStep[] {
  if (points.length < 2) {
    return [{ instruction: `前往 ${destination}`, distanceM: 100, maneuver: 'STRAIGHT', streetName: destination, icon: '⬆️' }]
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
        icon: '⬆️',
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
        let icon = '⬆️'
        let turnName = '直行前進'

        if (diff >= 25 && diff < 110) {
          maneuver = 'TURN_RIGHT'
          icon = '↱'
          turnName = '右轉'
        } else if (diff <= -25 && diff > -110) {
          maneuver = 'TURN_LEFT'
          icon = '↰'
          turnName = '左轉'
        } else if (diff >= 110) {
          maneuver = 'SLIGHT_RIGHT'
          icon = '⬏'
          turnName = '斜右轉'
        } else if (diff <= -110) {
          maneuver = 'SLIGHT_LEFT'
          icon = '⬎'
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
    icon: '🎯',
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
  const safetyScore = parseInt(searchParams.get('safety') || '85')
  const lightCount = parseInt(searchParams.get('lights') || '120')
  const cctvCount = parseInt(searchParams.get('cctv') || '5')

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

  // ETA Calculation
  const etaTime = new Date(Date.now() + remainingSec * 1000).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  // Speech output for turns
  const speakInstruction = useCallback((text: string) => {
    if (voiceMuted || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'zh-TW'
    utt.rate = 1.0
    window.speechSynthesis.speak(utt)
  }, [voiceMuted])

  // Timer countdown
  useEffect(() => {
    const t = setInterval(() => {
      setRemainingSec(r => Math.max(0, r - 1))
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
        zoom: 15.8,
        heading: 0,
        tilt: 30,
        disableDefaultUI: true,
        gestureHandling: 'greedy',
        styles: googleNavMapStyle,
      })

      // Draw walking dotted route (Google Maps style walking dots)
      const lineSymbol = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 4,
        fillColor: '#3b82f6',
        fillOpacity: 1,
        strokeColor: '#2563eb',
        strokeWeight: 1,
      }

      // Store polyline ref for dynamic updates
      polylineRef.current = new google.maps.Polyline({
        path: points,
        map: mapInstance.current,
        strokeColor: '#3b82f6',
        strokeOpacity: 0,
        icons: [{
          icon: lineSymbol,
          offset: '0',
          repeat: '14px',
        }],
      })

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

      // Initial camera view — fit bounds with wider maxZoom (15.8) for maximum surrounding map visibility
      const bounds = new google.maps.LatLngBounds()
      points.forEach(p => bounds.extend(p))
      mapInstance.current.fitBounds(bounds, { top: 180, bottom: 180, left: 60, right: 60 })

      google.maps.event.addListenerOnce(mapInstance.current, 'idle', () => {
        if (mapInstance.current && (mapInstance.current.getZoom() || 0) > 16.0) {
          mapInstance.current.setZoom(15.8)
        }
      })
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
      mapInstance.current.setZoom(15.8)
    }
  }

  const currentStep = steps[currentStepIdx] || {
    icon: '⬆️',
    streetName: destination,
    instruction: `前往 ${destination}`,
    distanceM: distanceM,
  }

  const nextStep = steps[currentStepIdx + 1]

  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: '#0a0e1a' }}>
      {/* Map view */}
      <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />

      {/* ─── Top Google Navigation Banner (Dark Teal) ────────────────────────── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        zIndex: 50,
        padding: '52px 16px 12px',
        background: 'linear-gradient(to bottom, rgba(2, 44, 34, 0.98) 85%, transparent)',
      }}>
        {/* Main Turn Banner */}
        <div style={{
          background: '#024738',
          borderRadius: 20,
          padding: '16px 20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          border: '1px solid rgba(16,185,129,0.3)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          {/* Big direction icon */}
          <div style={{
            fontSize: 38,
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {currentStep.icon}
          </div>

          {/* Turn text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
              前往
            </div>
            <div style={{
              fontSize: 22,
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

          {/* Sparkle companion button */}
          <button
            onClick={() => router.push(`/companion?origin=${origin}&destination=${destination}&safety=${safetyScore}&duration=${remainingSec}`)}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
              border: 'none',
              color: 'white',
              fontSize: 20,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(139,92,246,0.4)',
              flexShrink: 0,
            }}
          >
            ✦
          </button>
        </div>

        {/* Secondary "Next step" Sub-banner */}
        {nextStep && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            marginLeft: 8,
            padding: '6px 14px',
            background: '#013328',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.9)',
            fontSize: 13,
            fontWeight: 600,
          }}>
            <span>接下來</span>
            <span style={{ fontSize: 16 }}>{nextStep.icon}</span>
            <span>{nextStep.streetName}</span>
          </div>
        )}
      </div>

      {/* ─── Right Floating Control Column (Google Maps Floating Icons) ───────── */}
      <div style={{
        position: 'absolute', right: 16, top: '230px',
        display: 'flex', flexDirection: 'column', gap: 12,
        zIndex: 40,
      }}>
        {/* Compass Button */}
        <button
          onClick={recenterMap}
          style={floatingControlStyle}
          title="指北針"
        >
          🧭
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
          {voiceMuted ? '🔇' : '🔊'}
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
          🎯
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
          {isLoadingSafetyPlaces ? '⏳' : '🏪'}
        </button>
      </div>

      {/* ─── Bottom Google Navigation Bar (ETA Card) ─────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        zIndex: 50,
        padding: '12px 16px 28px',
        background: 'linear-gradient(to top, rgba(10,14,26,0.98) 85%, transparent)',
      }}>
        <div style={{
          background: 'rgba(17, 24, 39, 0.92)',
          backdropFilter: 'blur(20px)',
          borderRadius: 24,
          padding: '16px 20px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
        }}>
          {/* Top Info Bar: ETA + Exit Button + Steps Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            {/* Exit navigation button */}
            <button
              onClick={() => router.push('/')}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'white',
                fontSize: 20,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="結束導航"
            >
              ✕
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
              🔀
            </button>
          </div>

          {/* Quick Action Buttons Row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-primary"
              style={{ flex: 1, padding: '12px 6px', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', fontSize: 13, fontWeight: 700 }}
              onClick={() => router.push(`/companion?origin=${origin}&destination=${destination}&safety=${safetyScore}&duration=${remainingSec}`)}
            >
              🎙️ AI 陪聊
            </button>
            <button
              className="btn-primary"
              style={{ flex: 1, padding: '12px 6px', background: '#dc2626', fontSize: 13, fontWeight: 700 }}
              onClick={() => setShowAnxietyModal(true)}
            >
              ⚠️ 不安通報
            </button>
            <button
              className="btn-primary btn-danger"
              style={{ flex: 1, padding: '12px 6px', animation: 'none', fontSize: 13, fontWeight: 700 }}
              onClick={() => router.push('/sos')}
            >
              🆘 SOS
            </button>
          </div>
        </div>
      </div>

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
            <div style={{ fontSize: 20, fontWeight: 900 }}>🔀 轉彎路線指引</div>
            <button onClick={() => setShowStepsDrawer(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer' }}>✕</button>
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
                <div style={{ fontSize: 28, width: 40, textAlign: 'center' }}>{step.icon}</div>
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
