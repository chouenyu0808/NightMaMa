'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { loadMaps, fetchRoutes, geocodeAddress, formatDuration, formatDistance, sampleIndices, scoreToColor, type RouteResult, type LatLng } from '@/lib/maps'
import { searchNearbySafetyPlaces, drawSafetyPlaceMarkers, drawAnxietyReportMarkers } from '@/lib/safetyPlaces'
import AnxietyReportModal from '@/app/components/AnxietyReportModal'
import { IconMap, IconMic, IconSos, IconShield, IconZap, IconScale, IconBulb, IconCamera, IconStore, IconBadge, IconWalk, IconAlertTriangle, IconPin, IconPencil, IconSearch, IconTarget } from '@/components/Icons'

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
          drawRoutes(routes, selectedIdx)
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

  const drawRoutes = useCallback((scoredRoutes: ScoredRoute[], selected: number) => {
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
          strokeWeight: 8,
          strokeOpacity: 0.95,
          zIndex: 10,
        })
        polylinesRef.current.push(polyline)
      } else if (route.points.length > 0) {
        const unselectedPolyline = new google.maps.Polyline({
          path: route.points,
          map: mapInstance.current!,
          strokeColor: '#6b7280',
          strokeWeight: 5,
          strokeOpacity: 0.4,
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
        top: 100,
        bottom: 280,
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
      drawRoutes(scored, 0)
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
    drawRoutes(routes, idx)
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
      width: '100vw',
      height: '100dvh',
      overflow: 'hidden',
      background: '#0b0e1b',
      color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* ─── FULL SCREEN BACKGROUND GOOGLE MAP ───────────────────────────── */}
      <div ref={mapRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 }} />

      {/* ─── Top Floating Controls Over Map ────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        pointerEvents: 'none'
      }}>
        {/* Floating Top Header (when search sheet is closed) */}
        {!showSheet && (
          <div style={{ padding: '20px 20px 0', pointerEvents: 'auto' }}>
            {/* Hero Brand Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, lineHeight: 1.1, textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
                  Night<span style={{ background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>MaMa</span>
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 600, textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
                  今晚，也陪你回家。 💜
                </p>
              </div>

              {/* Mascot Art + Anxiety Report Pill Button */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                <button
                  onClick={() => setShowAnxietyModal(true)}
                  style={{
                    background: 'rgba(239, 68, 68, 0.25)', border: '1px solid rgba(239, 68, 68, 0.6)',
                    color: '#f87171', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    backdropFilter: 'blur(8px)', boxShadow: '0 4px 12px rgba(239,68,68,0.3)'
                  }}
                >
                  <IconAlertTriangle size={14} color="#f87171" /> 不安通報
                </button>

                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div style={{
                    background: 'rgba(30, 27, 75, 0.9)', border: '1px solid rgba(167, 139, 250, 0.4)',
                    borderRadius: '12px 12px 2px 12px', padding: '3px 8px', fontSize: 10, fontWeight: 700,
                    color: '#e0e7ff', marginBottom: 4, whiteSpace: 'nowrap'
                  }}>
                    我在這，陪你走 💜
                  </div>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 35%, #fde047 0%, #eab308 70%)',
                    boxShadow: '0 0 16px rgba(250, 204, 21, 0.6)',
                    position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'radial-gradient(circle at 30% 30%, #c084fc, #7e22ce)',
                      position: 'absolute', right: 2, bottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <span style={{ fontSize: 8 }}>🥰</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Search Card Floating Card ───────────────────────────── */}
            <div style={{
              background: 'rgba(26, 27, 54, 0.88)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: 20, padding: '16px', backdropFilter: 'blur(16px)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 8px #a78bfa' }} />
                  <div style={{ width: 1, height: 28, borderLeft: '2px dotted rgba(255,255,255,0.2)' }} />
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'rgba(244,114,182,0.2)', border: '1px solid rgba(244,114,182,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11
                  }}>
                    🏠
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>我的位置</div>
                    <input
                      ref={originInputRef}
                      value={origin}
                      onChange={e => setOrigin(e.target.value)}
                      placeholder="請輸入出發地"
                      style={{
                        background: 'transparent', border: 'none', outline: 'none',
                        color: 'white', fontSize: 14, fontWeight: 700, width: '100%'
                      }}
                    />
                  </div>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>回家</div>
                    <input
                      ref={destInputRef}
                      value={destination}
                      onChange={e => setDestination(e.target.value)}
                      placeholder="請輸入目的地"
                      style={{
                        background: 'transparent', border: 'none', outline: 'none',
                        color: 'white', fontSize: 14, fontWeight: 700, width: '100%'
                      }}
                    />
                  </div>
                </div>

                <button
                  onClick={swapOriginDest}
                  style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    color: '#a78bfa', fontSize: 16, cursor: 'pointer'
                  }}
                  title="對調"
                >
                  ⇅
                </button>
              </div>

              {error && <p style={{ color: '#ef4444', fontSize: 11, marginBottom: 8, textAlign: 'center' }}>{error}</p>}

              <button
                onClick={handleSearch}
                disabled={isLoading}
                style={{
                  width: '100%', height: 46, borderRadius: 14,
                  background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  border: 'none', color: 'white', fontSize: 16, fontWeight: 800,
                  cursor: 'pointer', boxShadow: '0 6px 20px rgba(124, 58, 237, 0.4)'
                }}
              >
                {isLoading ? '搜尋安心路線中...' : '帶我回家 ➔'}
              </button>
            </div>
          </div>
        )}

        {/* Floating Top Summary Bar (When candidate routes are being compared!) */}
        {showSheet && (
          <div style={{ padding: '8px 16px 0', pointerEvents: 'auto' }}>
            <div style={{
              background: 'rgba(17, 24, 39, 0.92)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 16, padding: '10px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{origin}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>➔</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f472b6' }}>{destination}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setShowAnxietyModal(true)}
                  style={{
                    background: 'rgba(239, 68, 68, 0.25)', border: '1px solid rgba(239, 68, 68, 0.5)',
                    color: '#f87171', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3
                  }}
                >
                  <IconAlertTriangle size={12} color="#f87171" /> 不安通報
                </button>
                <button
                  onClick={() => setShowSheet(false)}
                  style={{
                    background: 'rgba(255,255,255,0.1)', border: 'none', color: '#c4b5fd',
                    padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  <IconPencil size={12} /> 重新搜尋
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Recenter Map Button */}
      <button
        onClick={() => {
          if (mapInstance.current && selectedRoute.points?.length) {
            const bounds = new google.maps.LatLngBounds()
            selectedRoute.points.forEach(p => bounds.extend(p))
            mapInstance.current.fitBounds(bounds, { top: 100, bottom: 280, left: 40, right: 40 })
          }
        }}
        style={{
          position: 'absolute', right: 16, bottom: showSheet ? 340 : 90, zIndex: 50,
          width: 44, height: 44, borderRadius: '50%',
          background: 'rgba(17, 24, 39, 0.9)', border: '1px solid rgba(255, 255, 255, 0.2)',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', transition: 'all 0.2s ease'
        }}
        title="對焦點位"
      >
        <IconTarget size={20} color="white" />
      </button>

      {/* ─── FLOATING BOTTOM SHEET (選取安心路線) ───────────────────────── */}
      {/* NOTICE: NO pitch black backdrop overlay so the FULL MAP is 100% VISIBLE behind the cards! */}
      {showSheet && routes.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 72, left: 12, right: 12, zIndex: 80,
          background: 'rgba(17, 24, 39, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 24, padding: '16px 16px 18px',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)',
          animation: 'slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>
              選取安心路線 ({routes.length} 條)
            </div>
            <button
              onClick={() => setShowSheet(false)}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          {/* Segmented Candidate Route Selection Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {routes.map((r, i) => (
              <button
                key={i}
                onClick={() => handleSelectRoute(i)}
                style={{
                  flex: 1, padding: '8px 4px', borderRadius: 12,
                  background: i === selectedIdx ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.05)',
                  border: i === selectedIdx ? `2px solid ${r.safety.color}` : '1px solid rgba(255,255,255,0.1)',
                  color: i === selectedIdx ? 'white' : 'rgba(255,255,255,0.6)',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  transition: 'all 0.15s ease'
                }}
              >
                {typeIconFor(r.typeLabel, 14)}
                {r.typeLabel}
              </button>
            ))}
          </div>

          {/* Detailed Card for Selected Candidate Route */}
          {selectedRoute && (
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: `2px solid ${selectedRoute.safety?.color || '#10b981'}`,
              borderRadius: 16, padding: '12px 14px', marginBottom: 14
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {typeIconFor(selectedRoute.typeLabel, 16)}
                  <span style={{ fontWeight: 800, fontSize: 15, color: 'white' }}>{selectedRoute.typeLabel}路線</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#34d399' }}>
                  {formatDuration(selectedRoute.durationSec)}
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}> ({formatDistance(selectedRoute.distanceM)})</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, textAlign: 'center', marginBottom: 8 }}>
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '6px', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>路燈數量</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'white', marginTop: 2 }}>{selectedRoute.lightCount}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '6px', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>監視器</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'white', marginTop: 2 }}>{selectedRoute.cameraCount}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '6px', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>安全分數</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: selectedRoute.safety?.color, marginTop: 2 }}>{(selectedRoute.score / 10).toFixed(1)}/10</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>
                  🏪 {selectedRoute.storeCount || 4} 家24h超商
                </span>
                <span style={{ background: 'rgba(30,58,138,0.3)', color: '#93c5fd', fontSize: 11, padding: '3px 8px', borderRadius: 999 }}>
                  👮 {selectedRoute.policeCount || 2} 派出所
                </span>
              </div>
            </div>
          )}

          {/* Start Navigation Button */}
          <button
            onClick={() => {
              setShowSheet(false)
              router.push(`/navigate?polyline=${encodeURIComponent(selectedRoute.polyline || '')}&dest=${encodeURIComponent(destination)}&dist=${selectedRoute.distanceM || 1000}&dur=${selectedRoute.durationSec || 600}&safety=${selectedRoute.score || 88}&orig=${encodeURIComponent(origin)}`)
            }}
            style={{
              width: '100%', height: 48, borderRadius: 14,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none', color: 'white', fontSize: 16, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: 'pointer', boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)'
            }}
          >
            <IconWalk size={18} /> 開始導航 · {selectedRoute.typeLabel}路線 ({formatDuration(selectedRoute.durationSec)})
          </button>
        </div>
      )}

      {/* ─── Bottom Navigation Bar (導航 | 陪伴 | SOS) ─────────────────── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        height: 72, background: 'rgba(15, 23, 42, 0.92)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around'
      }}>
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
