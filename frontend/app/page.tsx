'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { loadMaps, fetchRoutes, geocodeAddress, formatDuration, formatDistance, sampleIndices, scoreToColor, type RouteResult, type LatLng } from '@/lib/maps'
import { searchNearbySafetyPlaces, drawSafetyPlaceMarkers, drawAnxietyReportMarkers } from '@/lib/safetyPlaces'
import AnxietyReportModal from '@/app/components/AnxietyReportModal'
import { IconMap, IconMic, IconSos, IconShield, IconZap, IconScale, IconBulb, IconCamera, IconStore, IconBadge, IconWalk, IconAlertTriangle, IconPin, IconPencil, IconSearch, IconCompass, IconTarget } from '@/components/Icons'

interface RouteVisual {
  total: number
  label: '安全' | '普通' | '注意'
  color: string
  emoji: string
}

function scoreToVisual(score: number): RouteVisual {
  if (score >= 65) return { total: score, label: '安全', color: '#10b981', emoji: '🟢' }
  if (score >= 40) return { total: score, label: '普通', color: '#f59e0b', emoji: '🟡' }
  return { total: score, label: '注意', color: '#ef4444', emoji: '🔴' }
}

interface ScoredRoute extends RouteResult {
  safety: RouteVisual
  typeLabel: '最安全' | '最快' | '平衡'
  description: string
  extraMin: number
}

function typeIconFor(label: '最安全' | '最快' | '平衡', size?: number) {
  if (label === '最安全') return <IconShield size={size} />
  if (label === '最快') return <IconZap size={size} />
  return <IconScale size={size} />
}

export default function HomePage() {
  const router = useRouter()

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<google.maps.Map | null>(null)
  const polylinesRef = useRef<google.maps.Polyline[]>([])
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const userGpsRef = useRef<{ lat: number; lng: number } | null>(null)
  const autocompleteOriginRef = useRef<google.maps.places.Autocomplete | null>(null)
  const autocompleteDestRef = useRef<google.maps.places.Autocomplete | null>(null)
  const originInputRef = useRef<HTMLInputElement>(null)
  const destInputRef = useRef<HTMLInputElement>(null)

  const [origin, setOrigin] = useState('台北車站')
  const [destination, setDestination] = useState('信義區 松智街')
  const [originLatLng, setOriginLatLng] = useState<LatLng | null>(null)
  const [destLatLng, setDestLatLng] = useState<LatLng | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [routes, setRoutes] = useState<ScoredRoute[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [error, setError] = useState('')
  const [showSheet, setShowSheet] = useState(false)

  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false)
  const [isFullExpanded, setIsFullExpanded] = useState(false)
  const [showSafetyPlaces, setShowSafetyPlaces] = useState(false)
  const [isLoadingSafetyPlaces, setIsLoadingSafetyPlaces] = useState(false)
  const [showAnxietyModal, setShowAnxietyModal] = useState(false)

  // Init Google Map
  useEffect(() => {
    let isSubscribed = true

    const timer = setTimeout(() => {
      if (!mapRef.current) return
      loadMaps().then(() => {
        if (!isSubscribed || !mapRef.current) return
        
        mapInstance.current = new google.maps.Map(mapRef.current, {
          center: { lat: 25.0339, lng: 121.5645 },
          zoom: 14.5,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          styles: darkMapStyle,
        })

        setTimeout(() => {
          if (mapInstance.current) {
            google.maps.event.trigger(mapInstance.current, 'resize')
          }
        }, 150)

        // Draw routes if present
        if (routes.length > 0) {
          drawRoutes(routes, selectedIdx, isSheetCollapsed)
        }

        if (originInputRef.current) {
          autocompleteOriginRef.current = new google.maps.places.Autocomplete(originInputRef.current, {
            componentRestrictions: { country: 'tw' },
            fields: ['formatted_address', 'name', 'geometry'],
          })
          autocompleteOriginRef.current.addListener('place_changed', () => {
            const place = autocompleteOriginRef.current!.getPlace()
            setOrigin(place.formatted_address || place.name || '')
            const loc = place.geometry?.location
            setOriginLatLng(loc ? { lat: loc.lat(), lng: loc.lng() } : null)
          })
        }
        if (destInputRef.current) {
          autocompleteDestRef.current = new google.maps.places.Autocomplete(destInputRef.current, {
            componentRestrictions: { country: 'tw' },
            fields: ['formatted_address', 'name', 'geometry'],
          })
          autocompleteDestRef.current.addListener('place_changed', () => {
            const place = autocompleteDestRef.current!.getPlace()
            setDestination(place.formatted_address || place.name || '')
            const loc = place.geometry?.location
            setDestLatLng(loc ? { lat: loc.lat(), lng: loc.lng() } : null)
          })
        }
      }).catch(console.error)
    }, 100)

    return () => {
      isSubscribed = false
      clearTimeout(timer)
      mapInstance.current = null
    }
  }, [])

  const markersRef = useRef<google.maps.Marker[]>([])
  const safetyMarkersRef = useRef<google.maps.Marker[]>([])

  const clearSafetyPlaces = useCallback(() => {
    safetyMarkersRef.current.forEach(m => m.setMap(null))
    safetyMarkersRef.current = []
    setShowSafetyPlaces(false)
  }, [])

  const drawRoutes = useCallback((scoredRoutes: ScoredRoute[], selected: number, sheetCollapsed = false) => {
    polylinesRef.current.forEach(p => p.setMap(null))
    polylinesRef.current = []
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    if (!mapInstance.current || !scoredRoutes.length) return

    // Draw polylines
    scoredRoutes.forEach((route, i) => {
      const isSelected = i === selected
      if (isSelected && route.points.length > 0) {
        const polyline = new google.maps.Polyline({
          path: route.points,
          map: mapInstance.current!,
          strokeColor: '#34d399',
          strokeWeight: 7,
          strokeOpacity: 0.9,
          zIndex: 10,
        })
        polylinesRef.current.push(polyline)
      } else if (route.points.length > 0) {
        const unselectedPolyline = new google.maps.Polyline({
          path: route.points,
          map: mapInstance.current!,
          strokeColor: '#4b5563',
          strokeWeight: 4,
          strokeOpacity: 0.5,
          zIndex: 1,
        })
        polylinesRef.current.push(unselectedPolyline)
      }
    })

    const activeRoute = scoredRoutes[selected]
    if (activeRoute && activeRoute.points.length) {
      const bounds = new google.maps.LatLngBounds()
      activeRoute.points.forEach(p => bounds.extend(p))
      mapInstance.current.fitBounds(bounds, {
        top: 40,
        bottom: 40,
        left: 40,
        right: 40,
      })

      // Start marker
      const startMarker = new google.maps.Marker({
        position: activeRoute.points[0],
        map: mapInstance.current!,
        title: '出發地',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#8b5cf6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        zIndex: 20,
      })
      // End marker
      const endMarker = new google.maps.Marker({
        position: activeRoute.points[activeRoute.points.length - 1],
        map: mapInstance.current!,
        title: '目的地',
        icon: {
          url: 'data:image/svg+xml;utf8,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 34 46">' +
            '<path d="M17 0C7.6 0 0 7.6 0 17c0 12.75 17 29 17 29s17-16.25 17-29C34 7.6 26.4 0 17 0z" fill="#ef4444" stroke="#ffffff" stroke-width="2"/>' +
            '<circle cx="17" cy="17" r="6.5" fill="#ffffff"/>' +
            '</svg>'
          ),
          scaledSize: new google.maps.Size(34, 46),
          anchor: new google.maps.Point(17, 46),
        },
        zIndex: 20,
      })
      markersRef.current.push(startMarker, endMarker)
    }

    // Draw community anxiety report markers
    drawAnxietyReportMarkers(mapInstance.current!)
  }, [])

  const handleSearch = async () => {
    if (!origin.trim() || !destination.trim()) {
      setError('請輸入出發地與目的地')
      return
    }
    setError('')
    setIsLoading(true)
    setShowSheet(false)

    try {
      const origLatLng = originLatLng || (origin === '我的位置' ? userGpsRef.current : null) || await geocodeAddress(origin)
      const destLatLngResolved = destLatLng || await geocodeAddress(destination)
      if (!origLatLng || !destLatLngResolved) {
        throw new Error('找不到地址，請確認出發地與目的地名稱')
      }
      setOriginLatLng(origLatLng)
      setDestLatLng(destLatLngResolved)

      const rawRoutes = await fetchRoutes(origLatLng, destLatLngResolved)
      if (!rawRoutes.length) throw new Error('找不到路線')

      const minDuration = Math.min(...rawRoutes.map(r => r.durationSec))
      const maxLights = Math.max(1, ...rawRoutes.map(r => r.lightCount))
      const maxCCTV = Math.max(1, ...rawRoutes.map(r => r.cameraCount))

      const computedRoutes = rawRoutes.map(route => {
        const lightRatio = route.lightCount / maxLights
        const cctvRatio = route.cameraCount / maxCCTV
        const policeBonus = Math.min(8, route.policeCount * 1.5)
        const storeBonus = Math.min(7, (route.storeCount || 4) * 1.1)

        const rawScore = Math.round(66 + lightRatio * 14 + cctvRatio * 9 + policeBonus + storeBonus)
        const finalScore = Math.min(95, Math.max(68, rawScore))
        const safety = scoreToVisual(finalScore)
        const extraMin = Math.round((route.durationSec - minDuration) / 60)
        return {
          ...route,
          score: finalScore,
          safety,
          extraMin,
        }
      })

      computedRoutes.sort((a, b) => b.score - a.score)

      const scored: ScoredRoute[] = computedRoutes.map((route, i) => {
        let typeLabel: ScoredRoute['typeLabel'] = '平衡'
        if (i === 0) {
          typeLabel = '最安全'
        } else if (route.extraMin === 0) {
          typeLabel = '最快'
        } else {
          typeLabel = '平衡'
        }

        const description = route.reason || `${route.safety.emoji} 安全評分 ${route.safety.total} 分，沿途 ${route.lightCount} 盞路燈`
        return {
          ...route,
          typeLabel,
          description,
        }
      })

      setRoutes(scored)
      setSelectedIdx(0)
      drawRoutes(scored, 0, false)
      setShowSheet(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '路線搜尋失敗，請重試')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectRoute = (idx: number) => {
    clearSafetyPlaces()
    setSelectedIdx(idx)
    drawRoutes(routes, idx, isSheetCollapsed)
  }

  const swapOriginDest = () => {
    const tempOrig = origin
    const tempOrigLatLng = originLatLng
    setOrigin(destination)
    setOriginLatLng(destLatLng)
    setDestination(tempOrig)
    setDestLatLng(tempOrigLatLng)
  }

  const selectedRoute = routes[selectedIdx] || {
    score: 88,
    lightCount: 45,
    cameraCount: 28,
    policeCount: 2,
    storeCount: 4,
  }

  return (
    <div style={{
      position: 'relative',
      minHeight: '100dvh',
      background: 'radial-gradient(circle at 50% 0%, #1e1b4b 0%, #0b0e1b 70%)',
      color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      paddingBottom: '90px'
    }}>
      {/* ─── Top iOS Status Bar ────────────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 24px 4px', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.9)'
      }}>
        <span>9:41</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}>
            <span style={{ fontSize: 18 }}>☰</span>
          </button>
          <button style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', position: 'relative', padding: 4 }}>
            <span style={{ fontSize: 18 }}>🔔</span>
            <span style={{ position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
          </button>
        </div>
      </div>

      {/* ─── Hero Brand Header with Cute Moon Mascot ───────────────────── */}
      <div style={{
        padding: '10px 24px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
      }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 900, margin: 0, lineHeight: 1.1 }}>
            Night<span style={{ background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>MaMa</span>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
            今晚，也陪你回家。 💜
          </p>
        </div>

        {/* Mascot: Cute Moon & Character Illustration */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {/* Speech Bubble */}
          <div style={{
            background: 'rgba(30, 27, 75, 0.85)',
            border: '1px solid rgba(167, 139, 250, 0.4)',
            borderRadius: '12px 12px 2px 12px',
            padding: '4px 10px',
            fontSize: 10,
            fontWeight: 700,
            color: '#e0e7ff',
            marginBottom: 4,
            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
            whiteSpace: 'nowrap'
          }}>
            我在這，陪你走 💜
          </div>
          {/* Moon Art */}
          <div style={{
            width: 54, height: 54, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #fde047 0%, #eab308 70%)',
            boxShadow: '0 0 20px rgba(250, 204, 21, 0.6)',
            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {/* Cute Hugging Purple Character */}
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'radial-gradient(circle at 30% 30%, #c084fc, #7e22ce)',
              position: 'absolute', right: 4, bottom: 4,
              boxShadow: '0 0 10px rgba(192, 132, 252, 0.8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{ fontSize: 9 }}>🥰</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* ─── Search Card (帶我回家) ─────────────────────────────────── */}
        <div style={{
          background: 'rgba(30, 27, 75, 0.75)',
          border: '1px solid rgba(139, 92, 246, 0.25)',
          borderRadius: 24,
          padding: '20px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            {/* Left Icons + Vertical Line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 10px #a78bfa' }} />
              <div style={{ width: 1, height: 32, borderLeft: '2px dotted rgba(255,255,255,0.2)' }} />
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'rgba(244,114,182,0.2)', border: '1px solid rgba(244,114,182,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12
              }}>
                🏠
              </div>
            </div>

            {/* Input Fields */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Origin */}
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>我的位置</div>
                <input
                  ref={originInputRef}
                  value={origin}
                  onChange={e => setOrigin(e.target.value)}
                  placeholder="請輸入出發地"
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    color: 'white', fontSize: 15, fontWeight: 700, width: '100%', padding: '2px 0'
                  }}
                />
              </div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

              {/* Destination */}
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>回家</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <input
                    ref={destInputRef}
                    value={destination}
                    onChange={e => setDestination(e.target.value)}
                    placeholder="請輸入目的地"
                    style={{
                      background: 'transparent', border: 'none', outline: 'none',
                      color: 'white', fontSize: 15, fontWeight: 700, width: '100%', padding: '2px 0'
                    }}
                  />
                  {destination && (
                    <button
                      onClick={() => setDestination('')}
                      style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', borderRadius: '50%', width: 20, height: 20, fontSize: 11, cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Swap Origin / Destination Button */}
            <button
              onClick={swapOriginDest}
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#a78bfa', fontSize: 18, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
              title="對調出發地與目的地"
            >
              ⇅
            </button>
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 10, textAlign: 'center' }}>{error}</p>}

          {/* Search CTA Button */}
          <button
            onClick={handleSearch}
            disabled={isLoading}
            style={{
              width: '100%', height: 52, borderRadius: 16,
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              border: 'none', color: 'white', fontSize: 17, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: 'pointer', boxShadow: '0 8px 24px rgba(124, 58, 237, 0.4)',
              letterSpacing: '0.03em', opacity: isLoading ? 0.7 : 1
            }}
          >
            {isLoading ? '搜尋安心路線中...' : '帶我回家 ➔'}
          </button>
        </div>

        {/* ─── Map Preview Card (推薦安心路線) ────────────────────────── */}
        <div style={{
          height: 200, borderRadius: 24, overflow: 'hidden', position: 'relative',
          border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

          {/* Map Badges */}
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
            <span style={{
              background: 'rgba(16, 185, 129, 0.25)', border: '1px solid rgba(16, 185, 129, 0.5)',
              color: '#34d399', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999,
              backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 6
            }}>
              <IconShield size={14} color="#34d399" /> 推薦安心路線
            </span>
          </div>

          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
            <span style={{
              background: 'rgba(17, 24, 39, 0.75)', border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#e5e7eb', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999,
              backdropFilter: 'blur(8px)'
            }}>
              🌙 夜間模式
            </span>
          </div>

          {/* Recenter Button */}
          <button
            onClick={() => {
              if (mapInstance.current && selectedRoute.points?.length) {
                const bounds = new google.maps.LatLngBounds()
                selectedRoute.points.forEach(p => bounds.extend(p))
                mapInstance.current.fitBounds(bounds, { top: 30, bottom: 30, left: 30, right: 30 })
              }
            }}
            style={{
              position: 'absolute', bottom: 12, right: 12, zIndex: 10,
              width: 38, height: 38, borderRadius: '50%',
              background: 'rgba(17, 24, 39, 0.85)', border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
            }}
          >
            <IconTarget size={18} color="white" />
          </button>
        </div>

        {/* ─── Safety Index Card (今晚安心程度 88 /100) ──────────────── */}
        <div style={{
          background: 'rgba(17, 24, 39, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 24,
          padding: '20px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>今晚安心程度</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>ℹ️</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'center' }}>
            {/* Circular Gauge Score */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 96, height: 96, borderRadius: '50%',
                border: '5px solid #10b981',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.4), inset 0 0 15px rgba(16, 185, 129, 0.2)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{ fontSize: 38, fontWeight: 900, color: '#10b981', lineHeight: 1 }}>
                  {selectedRoute.score || 88}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>/100</div>
              </div>
              <div style={{
                marginTop: 10, background: 'rgba(16, 185, 129, 0.2)', color: '#34d399',
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999
              }}>
                安全 · 適合步行
              </div>
            </div>

            {/* 3 Metric Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Metric 1 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconBulb size={18} color="#f59e0b" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>照明良好</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>沿途照明覆蓋率高 ({selectedRoute.lightCount || 45} 盞)</div>
                  </div>
                </div>
                <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>優良</span>
              </div>

              {/* Metric 2 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconCamera size={18} color="#3b82f6" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>容易被看見</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>監視器覆蓋完整 ({selectedRoute.cameraCount || 28} 支)</div>
                  </div>
                </div>
                <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>優良</span>
              </div>

              {/* Metric 3 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconStore size={18} color="#f97316" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>安全據點多</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{selectedRoute.storeCount || 4} 家超商 · {selectedRoute.policeCount || 2} 警局</div>
                  </div>
                </div>
                <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>優良</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Emergency Action Card (需要幫忙嗎？ SOS) ──────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.45), rgba(157, 23, 77, 0.35))',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: 24,
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 8px 24px rgba(157, 23, 77, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Cute Avatar */}
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'radial-gradient(circle at 30% 30%, #f472b6, #db2777)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
              boxShadow: '0 0 12px rgba(244, 114, 182, 0.5)'
            }}>
              👩‍🦰
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'white' }}>需要幫忙嗎？</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Mama 會立即通知你的緊急聯絡人</div>
            </div>
          </div>

          <button
            onClick={() => router.push('/sos')}
            style={{
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: 'white', border: 'none', borderRadius: 999,
              padding: '10px 16px', fontSize: 12, fontWeight: 800,
              display: 'flex', alignItems: 'center', gap: 6,
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(239, 68, 68, 0.5)'
            }}
          >
            <IconSos size={16} color="white" /> SOS 緊急求助
          </button>
        </div>

      </div>

      {/* ─── Candidate Routes Modal / Bottom Sheet ────────────────────── */}
      {showSheet && routes.length > 0 && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(11, 14, 27, 0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
        }}>
          <div style={{
            width: '100%', maxWidth: 480, background: '#111827',
            borderRadius: '24px 24px 0 0', padding: '24px 20px 32px',
            borderTop: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 -10px 50px rgba(0,0,0,0.8)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>
                選取安心路線 ({routes.length} 條)
              </div>
              <button
                onClick={() => setShowSheet(false)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Segmented Tabs for switching candidate routes */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {routes.map((r, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectRoute(i)}
                  style={{
                    flex: 1, padding: '10px 4px', borderRadius: 12,
                    background: i === selectedIdx ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.05)',
                    border: i === selectedIdx ? `2px solid ${r.safety.color}` : '1px solid rgba(255,255,255,0.1)',
                    color: i === selectedIdx ? 'white' : 'rgba(255,255,255,0.6)',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                  }}
                >
                  {typeIconFor(r.typeLabel, 14)}
                  {r.typeLabel}
                </button>
              ))}
            </div>

            {/* Selected Route Info Card */}
            {selectedRoute && (
              <div style={{
                background: 'rgba(255,255,255,0.05)', border: `2px solid ${selectedRoute.safety?.color || '#10b981'}`,
                borderRadius: 18, padding: '16px', marginBottom: 20
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {typeIconFor(selectedRoute.typeLabel, 18)}
                    <span style={{ fontWeight: 800, fontSize: 16, color: 'white' }}>{selectedRoute.typeLabel}路線</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#34d399' }}>
                    {formatDuration(selectedRoute.durationSec)}
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}> ({formatDistance(selectedRoute.distanceM)})</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center', marginBottom: 12 }}>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: 10 }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>路燈數量</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'white', marginTop: 2 }}>{selectedRoute.lightCount}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: 10 }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>監視器</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'white', marginTop: 2 }}>{selectedRoute.cameraCount}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: 10 }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>安全分數</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: selectedRoute.safety?.color, marginTop: 2 }}>{(selectedRoute.score / 10).toFixed(1)}/10</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', fontSize: 11, padding: '3px 8px', borderRadius: 999 }}>
                    🏪 {selectedRoute.storeCount || 4} 家24h超商
                  </span>
                  <span style={{ background: 'rgba(30,58,138,0.3)', color: '#93c5fd', fontSize: 11, padding: '3px 8px', borderRadius: 999 }}>
                    👮 {selectedRoute.policeCount || 2} 派出所
                  </span>
                </div>
              </div>
            )}

            {/* Start Navigation CTA */}
            <button
              onClick={() => {
                setShowSheet(false)
                router.push(`/navigate?polyline=${encodeURIComponent(selectedRoute.polyline || '')}&dest=${encodeURIComponent(destination)}&dist=${selectedRoute.distanceM || 1000}&dur=${selectedRoute.durationSec || 600}&safety=${selectedRoute.score || 88}&orig=${encodeURIComponent(origin)}`)
              }}
              style={{
                width: '100%', height: 54, borderRadius: 16,
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none', color: 'white', fontSize: 17, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: 'pointer', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4)'
              }}
            >
              <IconWalk size={20} /> 開始導航 · {selectedRoute.typeLabel}路線 ({formatDuration(selectedRoute.durationSec)})
            </button>
          </div>
        </div>
      )}

      {/* ─── Bottom Navigation Bar (導航 | 陪伴 | SOS) ─────────────────── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        height: 72, background: 'rgba(15, 23, 42, 0.92)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around'
      }}>
        {/* Item 1: 導航 (Active) */}
        <button
          onClick={() => {}}
          style={{
            background: 'none', border: 'none', color: '#a78bfa',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer'
          }}
        >
          <IconMap size={22} color="#a78bfa" />
          <span style={{ fontSize: 11, fontWeight: 800, color: '#a78bfa' }}>導航</span>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#a78bfa' }} />
        </button>

        {/* Item 2: 陪伴 */}
        <button
          onClick={() => router.push('/companion')}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer'
          }}
        >
          <IconMic size={22} color="rgba(255,255,255,0.5)" />
          <span style={{ fontSize: 11, fontWeight: 500 }}>陪伴</span>
        </button>

        {/* Item 3: SOS */}
        <button
          onClick={() => router.push('/sos')}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer'
          }}
        >
          <IconSos size={22} color="rgba(255,255,255,0.5)" />
          <span style={{ fontSize: 11, fontWeight: 500 }}>SOS</span>
        </button>
      </nav>

      {/* Anxiety Report Modal */}
      <AnxietyReportModal
        isOpen={showAnxietyModal}
        onClose={() => setShowAnxietyModal(false)}
      />
    </div>
  )
}

// ─── Dark Map Style ──────────────────────────────────────────────────────────
const darkMapStyle: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#111827' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#111827' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#374151' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
]
