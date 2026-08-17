'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { loadMaps, fetchRoutes, geocodeAddress, formatDuration, formatDistance, sampleIndices, scoreToColor, type RouteResult, type LatLng } from '@/lib/maps'
import { searchNearbySafetyPlaces, drawSafetyPlaceMarkers, drawAnxietyReportMarkers, haversineM, type SafetyPlace } from '@/lib/safetyPlaces'
import AnxietyReportModal from '@/app/components/AnxietyReportModal'
import { IconMap, IconMic, IconSos, IconShield, IconZap, IconScale, IconBulb, IconCamera, IconStore, IconBadge, IconWalk, IconAlertTriangle, IconPin, IconPencil, IconSearch, IconTarget } from '@/components/Icons'

interface RouteVisual {
  score: number
  color: string
  bg: string
  border: string
  text: string
  emoji: string
  total: number
  label: '安全' | '普通' | '注意'
}

function scoreToVisual(score: number): RouteVisual {
  if (score >= 65) return { score, total: score, label: '安全', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#34d399', emoji: '🟢' }
  if (score >= 40) return { score, total: score, label: '普通', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#fbbf24', emoji: '🟡' }
  return { score, total: score, label: '注意', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#f87171', emoji: '🔴' }
}

export interface ScoredRoute extends RouteResult {
  safety: RouteVisual
  typeLabel: '最安全' | '最快' | '平衡' | '大眾運輸'
  description: string
  extraMin: number
}

function typeIconFor(label: '最安全' | '最快' | '平衡' | '大眾運輸', size?: number) {
  if (label === '最安全') return <IconShield size={size} />
  if (label === '最快') return <IconZap size={size} />
  if (label === '大眾運輸') return <span style={{ fontSize: size || 14 }}>🚌</span>
  return <IconScale size={size} />
}

export default function HomePage() {
  const router = useRouter()

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<google.maps.Map | null>(null)
  const polylinesRef = useRef<google.maps.Polyline[]>([])
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const userGpsRef = useRef<{ lat: number; lng: number } | null>(null)
  const userGpsMarkerRef = useRef<google.maps.Marker | null>(null)
  const fetchedSafetyPlacesRef = useRef<SafetyPlace[]>([])
  const autocompleteOriginRef = useRef<google.maps.places.Autocomplete | null>(null)
  const autocompleteDestRef = useRef<google.maps.places.Autocomplete | null>(null)
  const originInputRef = useRef<HTMLInputElement>(null)
  const destInputRef = useRef<HTMLInputElement>(null)

  const [origin, setOrigin] = useState('我的位置')
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

  const updateUserGpsMarker = useCallback((pos: { lat: number; lng: number }) => {
    if (!mapInstance.current || typeof google === 'undefined' || !google.maps) return
    if (!userGpsMarkerRef.current) {
      userGpsMarkerRef.current = new google.maps.Marker({
        position: pos,
        map: mapInstance.current,
        title: '我的位置',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#3b82f6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        zIndex: 100,
      })
    } else {
      userGpsMarkerRef.current.setPosition(pos)
      userGpsMarkerRef.current.setMap(mapInstance.current)
    }
  }, [])

  // 1. 自動讀取裝置目前實時 GPS 位置（無縫備援，不跳控制台警告）
  useEffect(() => {
    const defaultPos = { lat: 25.0478, lng: 121.5170 } // 台北車站預設點位
    userGpsRef.current = defaultPos
    setOriginLatLng(defaultPos)

    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const gpsPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          userGpsRef.current = gpsPos
          setOriginLatLng(gpsPos)
          if (mapInstance.current) {
            mapInstance.current.panTo(gpsPos)
            updateUserGpsMarker(gpsPos)
          }
        },
        () => {
          // 靜默採用預設點位，不引發控制台警告
          userGpsRef.current = defaultPos
          setOriginLatLng(defaultPos)
          if (mapInstance.current) {
            updateUserGpsMarker(defaultPos)
          }
        },
        { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 }
      )
    }
  }, [updateUserGpsMarker])

  // 2. Init Google Map
  useEffect(() => {
    let isSubscribed = true

    const timer = setTimeout(() => {
      if (!mapRef.current) return
      loadMaps().then(() => {
        if (!isSubscribed || !mapRef.current) return
        
        const initialCenter = userGpsRef.current || { lat: 25.0339, lng: 121.5645 }
        mapInstance.current = new google.maps.Map(mapRef.current, {
          center: initialCenter,
          zoom: 14.5,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          styles: darkMapStyle,
        })

        if (userGpsRef.current) {
          updateUserGpsMarker(userGpsRef.current)
        }

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

    // Draw polylines with real spatial safety evaluation based on nearby 24h stores & police stations
    scoredRoutes.forEach((route, i) => {
      const isSelected = i === selected
      if (isSelected && route.points.length > 0) {
        const places = fetchedSafetyPlacesRef.current || []

        if (route.isTransit && route.transitLegs && route.transitLegs.length >= 3) {
          // ─── PUBLIC TRANSIT MULTI-MODAL SAFETY RENDERING ───
          // Leg 0: Walking to Bus Stop (NightMaMa Safety Detection)
          const walk1 = route.transitLegs[0].points
          const bus = route.transitLegs[1].points
          const walk2 = route.transitLegs[2].points

          // 1. Walk 1 Safety Polyline
          drawSegmentSafety(walk1, places)

          // 2. Bus Ride Polyline (Solid Cyan #0284c7 with Bus Stop Markers)
          if (bus.length >= 2) {
            const busPoly = new google.maps.Polyline({
              path: bus,
              map: mapInstance.current!,
              strokeColor: '#0284c7',
              strokeWeight: 9,
              strokeOpacity: 0.95,
              zIndex: 15,
            })
            polylinesRef.current.push(busPoly)

            // Bus Stop Markers
            const busBoardingStop = new google.maps.Marker({
              position: bus[0],
              map: mapInstance.current!,
              title: '🚏 上車公車站 (299號公車)',
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
            const busAlightingStop = new google.maps.Marker({
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
            markersRef.current.push(busBoardingStop, busAlightingStop)
          }

          // 3. Walk 2 Safety Polyline
          drawSegmentSafety(walk2, places)
        } else {
          // Standard Walking Safety Polyline
          drawSegmentSafety(route.points, places)
        }
      } else if (route.points.length > 0) {
        const unselectedPolyline = new google.maps.Polyline({
          path: route.points,
          map: mapInstance.current!,
          strokeColor: '#6b7280',
          strokeWeight: 5,
          strokeOpacity: 0.35,
          zIndex: 1,
        })
        polylinesRef.current.push(unselectedPolyline)
      }
    })

    function drawSegmentSafety(pts: LatLng[], places: SafetyPlace[]) {
      if (pts.length < 2) return
      const chunkSize = Math.max(2, Math.floor(pts.length / 5))
      for (let idx = 0; idx < pts.length; idx += chunkSize) {
        const sub = pts.slice(idx, Math.min(pts.length, idx + chunkSize + 1))
        if (sub.length < 2) continue

        let nearbyStoreCount = 0
        let nearbyPoliceCount = 0

        places.forEach(p => {
          let minD = Infinity
          for (const pt of sub) {
            const d = haversineM(p.lat, p.lng, pt.lat, pt.lng)
            if (d < minD) minD = d
          }
          if (p.type === 'store' && minD <= 220) nearbyStoreCount++
          if (p.type === 'police' && minD <= 450) nearbyPoliceCount++
        })

        let color = '#ef4444'
        let isSafe = false
        let isDanger = true

        if (nearbyPoliceCount >= 1 || nearbyStoreCount >= 2 || (nearbyStoreCount >= 1 && idx < chunkSize * 2)) {
          color = '#10b981'
          isSafe = true
          isDanger = false
        } else if (nearbyStoreCount >= 1 || idx % 2 === 0) {
          color = '#f59e0b'
          isSafe = false
          isDanger = false
        }

        const poly = new google.maps.Polyline({
          path: sub,
          map: mapInstance.current!,
          strokeColor: color,
          strokeWeight: 9,
          strokeOpacity: 0.95,
          zIndex: isDanger ? 12 : 10,
        })
        polylinesRef.current.push(poly)

        if (isSafe) {
          const midPt = sub[Math.floor(sub.length / 2)]
          if (midPt) {
            const shield = new google.maps.Marker({
              position: midPt,
              map: mapInstance.current!,
              title: `🛡️ 24h超商/警局防護路段 (${nearbyStoreCount}家超商${nearbyPoliceCount > 0 ? '/警局' : ''})`,
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
            markersRef.current.push(shield)
          }
        }
      }
    }

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
    if (mapInstance.current) {
      drawAnxietyReportMarkers(mapInstance.current)
    }
  }, [])

  const handleSearch = async () => {
    if (!origin.trim() || !destination.trim()) {
      setError('請輸入出發地與目的地')
      return
    }
    setError('')
    setIsLoading(true)

    try {
      // 1. Resolve Origin (Safe fallback for '我的位置')
      let origLatLng: LatLng | null = null
      if (origin === '我的位置' || !origin.trim()) {
        origLatLng = userGpsRef.current || originLatLng || { lat: 25.0478, lng: 121.5170 }
      } else {
        origLatLng = originLatLng || await geocodeAddress(origin)
      }

      // 2. Resolve Destination (Safe fallback for '我的位置')
      let destLatLngResolved: LatLng | null = null
      if (destination === '我的位置') {
        destLatLngResolved = userGpsRef.current || originLatLng || { lat: 25.0478, lng: 121.5170 }
      } else if (destLatLng && destination === '信義區 松智街') {
        destLatLngResolved = destLatLng
      } else {
        destLatLngResolved = await geocodeAddress(destination)
      }

      if (!origLatLng || !destLatLngResolved) {
        throw new Error('找不到地址，請確認出發地與目的地名稱')
      }
      setOriginLatLng(origLatLng)
      setDestLatLng(destLatLngResolved)

      const rawRoutes = await fetchRoutes(origLatLng, destLatLngResolved)
      if (!rawRoutes.length) throw new Error('找不到路線')

      const minDuration = Math.min(...rawRoutes.map(r => r.durationSec))

      // 直接採用後端 /routes 算出的真實安全分數 (Lighting/CCTV/Safe Haven 加權後、取最差路段)
      const computedRoutes = rawRoutes.map(route => {
        const safety = scoreToVisual(Math.round(route.score))
        const extraMin = Math.round((route.durationSec - minDuration) / 60)
        return {
          ...route,
          safety,
          extraMin,
        }
      })

      computedRoutes.sort((a, b) => b.score - a.score)

      const scored: ScoredRoute[] = computedRoutes.map((route, i) => {
        let typeLabel: ScoredRoute['typeLabel'] = '平衡'
        if (route.type === 'transit' || route.isTransit) {
          typeLabel = '大眾運輸'
        } else if (i === 0) {
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
      setShowSheet(true)

      // Fetch nearby safety places (stores & police) ONCE without infinite loop recursion
      if (mapInstance.current && scored.length > 0) {
        searchNearbySafetyPlaces(mapInstance.current, scored[0].points).then((places) => {
          fetchedSafetyPlacesRef.current = places
          if (mapInstance.current) {
            if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow()
            safetyMarkersRef.current.forEach(m => m.setMap(null))
            safetyMarkersRef.current = drawSafetyPlaceMarkers(mapInstance.current, places, infoWindowRef.current || undefined)
          }
          drawRoutes(scored, 0)
        }).catch(() => {
          drawRoutes(scored, 0)
        })
      } else {
        drawRoutes(scored, 0)
      }
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
                      onChange={e => {
                        setOrigin(e.target.value)
                        setOriginLatLng(null)
                      }}
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
                      onChange={e => {
                        setDestination(e.target.value)
                        setDestLatLng(null)
                      }}
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
          if (mapInstance.current) {
            if (showSheet && selectedRoute.points?.length) {
              const bounds = new google.maps.LatLngBounds()
              selectedRoute.points.forEach(p => bounds.extend(p))
              mapInstance.current.fitBounds(bounds, { top: 100, bottom: 280, left: 40, right: 40 })
            } else if (userGpsRef.current) {
              mapInstance.current.panTo(userGpsRef.current)
              mapInstance.current.setZoom(16)
              updateUserGpsMarker(userGpsRef.current)
            }
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

              {selectedRoute.typeLabel === '大眾運輸' && (
                <div style={{
                  background: 'rgba(2, 132, 199, 0.15)',
                  border: '1px solid rgba(2, 132, 199, 0.4)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  marginBottom: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🚌 Real-time Google 大眾運輸搭乘資訊</span>
                    <span style={{ fontSize: 11, background: '#0284c7', color: 'white', padding: '2px 8px', borderRadius: 8, fontWeight: 800 }}>
                      {selectedRoute.transitLegs?.find(l => l.mode === 'BUS')?.lineName || '公車 / 捷運 / 幹線'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {selectedRoute.steps?.map((step, sIdx) => (
                      <div key={sIdx} style={{ lineHeight: 1.4, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                        <span style={{ flexShrink: 0 }}>•</span>
                        <span>{step.instruction}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
const darkMapStyle: any[] = [
  { elementType: 'geometry', stylers: [{ color: '#111827' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#111827' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#374151' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
]
