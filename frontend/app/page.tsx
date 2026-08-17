'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { loadMaps, fetchRoutes, geocodeAddress, formatDuration, formatDistance, type RouteResult, type LatLng } from '@/lib/maps'
import { searchNearbySafetyPlaces, drawSafetyPlaceMarkers, drawAnxietyReportMarkers } from '@/lib/safetyPlaces'
import Logo from '@/components/Logo'

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

type AppState = 'landing' | 'map'

// ─── Line Icons（取代 emoji，風格參考 Google Maps）───────────────────────────────
function IconShield({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z" /></svg>
}
function IconBolt({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 11 14 11 22 21 10 13 10 13 2" /></svg>
}
function IconBalance({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="3" x2="12" y2="21" /><path d="M5 7h14" /><path d="M5 7 2 13a3 3 0 0 0 6 0z" /><path d="M19 7l-3 6a3 3 0 0 0 6 0z" /></svg>
}
function IconBulb({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z" /></svg>
}
function IconCamera({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
}
function IconStore({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5" /><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M9 20v-6h6v6" /><path d="M3 9h18" /></svg>
}
function IconBadge({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M8.5 13 7 22l5-3 5 3-1.5-9" /></svg>
}
function IconPin({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
}
function IconFlag({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V4" /><path d="M4 4h14l-2 4 2 4H4" /></svg>
}
function IconSearch({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
}
function IconWalk({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4" r="2" /><path d="M9 22l1-6-2-2 1-5 3-2 3 2 3 4-2 1-2-3-1 3 2 2-1 6" /><path d="M8 22l2-6" /></svg>
}

function typeIconFor(label: '最安全' | '最快' | '平衡', size?: number) {
  if (label === '最安全') return <IconShield size={size} />
  if (label === '最快') return <IconBolt size={size} />
  return <IconBalance size={size} />
}

export default function HomePage() {
  const router = useRouter()
  const [appState, setAppState] = useState<AppState>('map')

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<google.maps.Map | null>(null)
  const polylinesRef = useRef<google.maps.Polyline[]>([])
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const userGpsRef = useRef<{ lat: number; lng: number } | null>(null)
  const autocompleteOriginRef = useRef<google.maps.places.Autocomplete | null>(null)
  const autocompleteDestRef = useRef<google.maps.places.Autocomplete | null>(null)
  const originInputRef = useRef<HTMLInputElement>(null)
  const destInputRef = useRef<HTMLInputElement>(null)

  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [originLatLng, setOriginLatLng] = useState<LatLng | null>(null)
  const [destLatLng, setDestLatLng] = useState<LatLng | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [routes, setRoutes] = useState<ScoredRoute[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [error, setError] = useState('')
  const [showSheet, setShowSheet] = useState(false)
  const [navBarVisible, setNavBarVisible] = useState(false)

  // Init map when entering map state
  useEffect(() => {
    if (appState !== 'map') return
    const timer = setTimeout(() => {
      if (!mapRef.current) return
      loadMaps().then(() => {
        if (!mapRef.current || mapInstance.current) return
        mapInstance.current = new google.maps.Map(mapRef.current, {
          center: { lat: 25.0478, lng: 121.5319 },
          zoom: 14,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          styles: darkMapStyle,
        })
        google.maps.event.trigger(mapInstance.current, 'resize')
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
    return () => clearTimeout(timer)
  }, [appState])

  const markersRef = useRef<google.maps.Marker[]>([])
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false)
  const [isSearchCollapsed, setIsSearchCollapsed] = useState(false)

  const drawRoutes = useCallback((scoredRoutes: ScoredRoute[], selected: number, sheetCollapsed = false, searchCollapsed = false) => {
    polylinesRef.current.forEach(p => p.setMap(null))
    polylinesRef.current = []
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    if (!mapInstance.current || !scoredRoutes.length) return

    // Draw polylines
    scoredRoutes.forEach((route, i) => {
      const isSelected = i === selected
      const polyline = new google.maps.Polyline({
        path: route.points.map(p => ({ lat: p.lat, lng: p.lng })),
        map: mapInstance.current!,
        strokeColor: isSelected ? route.safety.color : 'rgba(255,255,255,0.25)',
        strokeWeight: isSelected ? 7 : 4,
        strokeOpacity: isSelected ? 1 : 0.4,
        zIndex: isSelected ? 10 : 1,
      })
      polylinesRef.current.push(polyline)
    })

    const selectedRoute = scoredRoutes[selected]
    const points = selectedRoute.points

    if (points.length >= 2) {
      // Start marker (Origin)
      const startMarker = new google.maps.Marker({
        position: points[0],
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
      // End marker (Destination)
      const endMarker = new google.maps.Marker({
        position: points[points.length - 1],
        map: mapInstance.current!,
        title: '目的地',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: '#10b981',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        zIndex: 20,
      })
      markersRef.current.push(startMarker, endMarker)
    }

    // Search and display 24h convenience stores, police stations, and anxiety report hotspots
    if (mapInstance.current) {
      if (!infoWindowRef.current) {
        infoWindowRef.current = new google.maps.InfoWindow()
      }
      searchNearbySafetyPlaces(mapInstance.current, points).then(places => {
        if (mapInstance.current) {
          const placeMarkers = drawSafetyPlaceMarkers(mapInstance.current, places, infoWindowRef.current || undefined)
          markersRef.current.push(...placeMarkers)
        }
      }).catch(console.error)

      drawAnxietyReportMarkers(mapInstance.current, infoWindowRef.current || undefined).then(repMarkers => {
        markersRef.current.push(...repMarkers)
      }).catch(console.error)
    }

    // Auto fit bounds to full route
    const bounds = new google.maps.LatLngBounds()
    points.forEach(p => bounds.extend(p))

    // Top padding: ~110px if collapsed, ~240px if expanded
    const topPad = searchCollapsed ? 110 : 240
    // Bottom padding: ~90px if collapsed, ~240px if expanded
    const bottomPad = sheetCollapsed ? 90 : 240

    if (mapInstance.current) {
      google.maps.event.trigger(mapInstance.current, 'resize')
      mapInstance.current.fitBounds(bounds, {
        top: topPad,
        bottom: bottomPad,
        left: 35,
        right: 35,
      })
    }
  }, [])

  // Continuous GPS tracking with high accuracy
  useEffect(() => {
    if (appState === 'map' && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        pos => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          userGpsRef.current = coords
          if (!origin) setOrigin('我的位置')
        },
        err => console.warn('GPS tracking notice:', err),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      )
      return () => navigator.geolocation.clearWatch(watchId)
    }
  }, [appState, origin])
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportType, setReportType] = useState('💡 路燈故障/昏暗')
  const [reportNote, setReportNote] = useState('')
  const [reportedSpots, setReportedSpots] = useState<Array<{ id: number; type: string; note: string; lat: number; lng: number }>>([])

  useEffect(() => {
    const saved = localStorage.getItem('nightmama_unsafe_spots')
    if (saved) {
      try { setReportedSpots(JSON.parse(saved)) } catch {}
    }
  }, [])

  const submitReport = () => {
    const lat = userGpsRef.current?.lat || 25.0478
    const lng = userGpsRef.current?.lng || 121.5170
    const newSpot = { id: Date.now(), type: reportType, note: reportNote, lat, lng }
    const updated = [...reportedSpots, newSpot]
    setReportedSpots(updated)
    localStorage.setItem('nightmama_unsafe_spots', JSON.stringify(updated))
    setShowReportModal(false)
    setReportNote('')

    if (mapInstance.current) {
      const dangerMarker = new google.maps.Marker({
        position: { lat, lng },
        map: mapInstance.current,
        title: `🚨 社群回報暗區: ${reportType}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#ef4444',
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      })
      markersRef.current.push(dangerMarker)
    }

    alert('✅ 不安暗區點位已成功匿名通報！地圖已為您與其他使用者建立警示標籤。')
  }

  const handleSearch = async () => {
    if (!origin.trim() || !destination.trim()) {
      setError('請輸入出發地與目的地')
      return
    }
    setError('')
    setIsLoading(true)
    setShowSheet(false)

    try {
      // Autocomplete's place_changed sometimes doesn't fire (Enter-key race,
      // browser's own address autofill) leaving *LatLng null even though the
      // field looks filled in — geocode the typed text as a fallback.
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

      const typeLabelOf: Record<string, ScoredRoute['typeLabel']> = {
        fastest: '最快',
        safest: '最安全',
        balanced: '平衡',
      }

      const scored: ScoredRoute[] = rawRoutes.map(route => {
        const safety = scoreToVisual(route.score)
        const extraMin = Math.round((route.durationSec - minDuration) / 60)
        const typeLabel = typeLabelOf[route.type] ?? '平衡'
        const description = route.reason || `${safety.emoji} 安全評分 ${safety.total} 分，沿途 ${route.lightCount} 盞路燈`
        return { ...route, safety, typeLabel, description, extraMin }
      })

      // Sort by Safety Total Score descending (Highest safety score at the top!)
      scored.sort((a, b) => b.safety.total - a.safety.total)
      setRoutes(scored)
      setSelectedIdx(0)
      setIsSearchCollapsed(true)
      drawRoutes(scored, 0, false, true)
      setShowSheet(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '路線搜尋失敗，請重試')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectRoute = (idx: number) => {
    setSelectedIdx(idx)
    drawRoutes(routes, idx, isSheetCollapsed, isSearchCollapsed)
  }

  const setSheetCollapsed = (next: boolean) => {
    setIsSheetCollapsed(next)
    if (routes.length > 0) {
      drawRoutes(routes, selectedIdx, next, isSearchCollapsed)
    }
  }

  const toggleCollapse = () => setSheetCollapsed(!isSheetCollapsed)

  // 底部路線卡片可上下拖曳展開/收合
  const draggingRef = useRef(false)
  const dragMovedRef = useRef(false)
  const onSheetDragStart = (e: React.PointerEvent) => {
    draggingRef.current = true
    dragMovedRef.current = false
    const startY = e.clientY
    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - startY) > 10) dragMovedRef.current = true
    }
    const onUp = (ev: PointerEvent) => {
      draggingRef.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const delta = ev.clientY - startY
      if (delta > 40 && !isSheetCollapsed) setSheetCollapsed(true)
      else if (delta < -40 && isSheetCollapsed) setSheetCollapsed(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 底部導航列預設隱藏，往上滑手把才展開（節省地圖空間）
  const navDragMovedRef = useRef(false)
  const onNavHandleDragStart = (e: React.PointerEvent) => {
    navDragMovedRef.current = false
    const startY = e.clientY
    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - startY) > 10) navDragMovedRef.current = true
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const delta = ev.clientY - startY
      if (delta < -20) setNavBarVisible(true)
      else if (delta > 20) setNavBarVisible(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const handleStartNavigation = () => {
    const route = routes[selectedIdx]
    if (!route) return
    const params = new URLSearchParams({
      origin, destination,
      polyline: route.polyline,
      duration: String(route.durationSec),
      distance: String(route.distanceM),
      safety: String(route.safety.total),
      lights: String(route.lightCount),
      cctv: String(route.cameraCount),
      steps: JSON.stringify(route.steps || []),
    })
    router.push(`/navigate?${params}`)
  }

  if (appState === 'landing') {
    return <LandingPage onStart={() => setAppState('map')} />
  }

  // 顯示全部候選路線（最快/最安全/平衡，最多 3 條），依安全分數排序
  const displayRoutes = routes.map((route, idx) => ({ route, idx }))

  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
      {/* Map */}
      <div ref={mapRef} style={{ position: 'absolute', inset: 0, background: '#eef3e8' }} />

      {/* Top search panel */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '52px 16px 16px',
        background: 'rgba(10,14,26,0.97)',
        zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <button onClick={() => setAppState('landing')} style={{ background: 'rgba(17,24,39,0.7)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 16, borderRadius: 999, width: 32, height: 32, cursor: 'pointer' }}>←</button>
          <button
            onClick={() => setShowReportModal(true)}
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              fontWeight: 700,
              color: '#f59e0b',
              background: 'rgba(245,158,11,0.15)',
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid rgba(245,158,11,0.3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            📢 不安通報
          </button>
        </div>

        {isSearchCollapsed && routes.length > 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 14px',
              background: 'rgba(17,24,39,0.85)',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.12)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, paddingRight: 8 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#60a5fa', flexShrink: 0 }} />
              {origin.split('區')[1] || origin.slice(0, 10)} →
              <IconFlag size={13} />
              {destination.split('區')[1] || destination.slice(0, 10)}
            </div>
            <button
              onClick={() => {
                setIsSearchCollapsed(false)
                drawRoutes(routes, selectedIdx, isSheetCollapsed, false)
              }}
              style={{
                background: 'rgba(139,92,246,0.2)',
                color: '#c4b5fd',
                border: '1px solid rgba(139,92,246,0.4)',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ✏️ 編輯搜尋
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', background: '#60a5fa' }} />
              <input
                ref={originInputRef}
                className="input-field"
                style={{ paddingLeft: 42 }}
                placeholder="出發地（例：松山車站）"
                value={origin}
                onChange={e => { setOrigin(e.target.value); setOriginLatLng(null) }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#ef4444', display: 'flex' }}><IconPin size={14} /></span>
              <input
                ref={destInputRef}
                className="input-field"
                style={{ paddingLeft: 42, paddingRight: 44 }}
                placeholder="目的地"
                value={destination}
                onChange={e => { setDestination(e.target.value); setDestLatLng(null) }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
              <button
                onClick={handleSearch}
                disabled={isLoading}
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)', border: 'none', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', opacity: isLoading ? 0.6 : 1,
                }}
              >
                <IconSearch size={15} />
              </button>
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: 13, paddingLeft: 4 }}>{error}</p>}
          </div>
        )}
      </div>

      {/* Route bottom sheet — 只比較「安心路線」vs「最快路線」兩條 */}
      {showSheet && routes.length > 0 && (
        <div
          className="bottom-sheet"
          style={{
            bottom: '16px',
            background: '#111827',
            border: '1px solid rgba(255,255,255,0.1)',
            paddingBottom: isSheetCollapsed ? '12px' : '20px',
            maxHeight: isSheetCollapsed ? '70px' : '40dvh',
            zIndex: 60,
            overflow: 'hidden',
            touchAction: 'none',
            transition: draggingRef.current ? 'none' : 'all 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          <div
            onClick={() => { if (dragMovedRef.current) return; toggleCollapse() }}
            onPointerDown={onSheetDragStart}
            style={{ cursor: 'grab', padding: '4px 0 8px' }}
          >
            <div className="bottom-sheet-handle" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                找到 {displayRoutes.length} 條路線 · 依安全評分排序 ↓
              </p>
              <button
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'white',
                  borderRadius: 999,
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {isSheetCollapsed ? '📋 展開卡片' : '🗺️ 看全景地圖'}
              </button>
            </div>
          </div>

          {!isSheetCollapsed && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '22dvh', overflowY: 'auto' }} className="scrollable">
                {[...displayRoutes]
                  .sort((a, b) => (a.idx === selectedIdx ? -1 : 0) - (b.idx === selectedIdx ? -1 : 0))
                  .map(({ route, idx }) =>
                    idx === selectedIdx ? (
                      <RouteCard key={idx} route={route} onClick={() => handleSelectRoute(idx)} />
                    ) : (
                      <RouteRow key={idx} route={route} onClick={() => handleSelectRoute(idx)} />
                    )
                  )}
              </div>
              <button className="btn-primary" style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={handleStartNavigation}>
                <IconWalk size={16} /> 開始導航 · {routes[selectedIdx]?.safety.label}路線
              </button>
            </>
          )}
        </div>
      )}

      {/* Unsafe Dark Spot Report Modal */}
      {showReportModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div className="glass" style={{ width: '100%', maxWidth: 360, borderRadius: 24, padding: 24, border: '1px solid rgba(245,158,11,0.3)', background: '#1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                📢 匿名回報不安暗區/死角
              </div>
              <button onClick={() => setShowReportModal(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              您的匿名回報將用於即時在地圖標記暗區，提醒其他夜行民眾，並作為大數據城市暗巷治理參考。
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>1. 選擇問題類型：</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['💡 路燈故障/昏暗', '🚨 治安死角/可疑人士', '🚧 施工障礙/無人道'].map(type => (
                  <button
                    key={type}
                    onClick={() => setReportType(type)}
                    style={{
                      padding: '6px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
                      border: reportType === type ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.15)',
                      background: reportType === type ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.05)',
                      color: reportType === type ? '#fbbf24' : '#d1d5db',
                      fontWeight: reportType === type ? 700 : 400,
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <label style={{ fontSize: 12, fontWeight: 700, color: 'white', marginTop: 4 }}>2. 補充說明 (選填)：</label>
              <input
                className="input-field"
                placeholder="例如：路燈失修無光源、死角盲區..."
                value={reportNote}
                onChange={e => setReportNote(e.target.value)}
              />
            </div>

            <button
              className="btn-primary"
              onClick={submitReport}
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', fontWeight: 800, padding: 14 }}
            >
              傳送匿名不安通報
            </button>
          </div>
        </div>
      )}

      {/* 導航列預設收起，往上滑或點手把才顯示；路線結果面板顯示時完全讓出空間 */}
      {!(showSheet && routes.length > 0) && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 55 }}>
          {navBarVisible && <NavBar active="home" />}
          <div
            onClick={() => { if (!navDragMovedRef.current) setNavBarVisible(v => !v) }}
            onPointerDown={onNavHandleDragStart}
            style={{ display: 'flex', justifyContent: 'center', padding: navBarVisible ? '2px 0 6px' : '10px 0 14px', cursor: 'grab', touchAction: 'none' }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.35)' }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Landing Page ────────────────────────────────────────────────────────────
function LandingPage({ onStart }: { onStart: () => void }) {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Star field animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const stars = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.4 + 0.2,
      alpha: Math.random(),
      speed: Math.random() * 0.004 + 0.001,
    }))

    let raf: number
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      stars.forEach(s => {
        s.alpha += s.speed
        const a = Math.abs(Math.sin(s.alpha))
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`
        ctx.fill()
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  const features = [
    { icon: '💡', title: '路燈密度分析', desc: '台北市 145,919 盞路燈即時評分' },
    { icon: '📹', title: '監視器覆蓋率', desc: '5,036 支 警察局 CCTV 涵蓋全台北' },
    { icon: '🎙️', title: 'AI 語音陪聊', desc: 'Gemini 3.6 Flash 全程陪伴，化解夜行焦慮' },
    { icon: '🆘', title: '一鍵緊急通知', desc: 'LINE 即時定位發送給緊急聯絡人' },
  ]

  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 0%, #1a0a2e 0%, #0a0e1a 60%)' }}>
      {/* Star canvas */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      {/* Glow orbs */}
      <div style={{ position: 'absolute', top: '8%', left: '20%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '15%', right: '10%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="scrollable" style={{ position: 'relative', zIndex: 10, height: '100%', display: 'flex', flexDirection: 'column', padding: '50px 24px 100px', gap: 0 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24, animation: 'fadeIn 0.8s ease' }}>
          <div style={{ marginBottom: 12, filter: 'drop-shadow(0 0 24px rgba(139,92,246,0.6))' }}>
            <Logo size={72} />
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>
            <span className="gradient-text">NightMaMa</span>
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.05em' }}>
            夜間安全導航 · AI 守護每一步
          </p>
        </div>

        {/* Hero stats */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, animation: 'fadeIn 0.8s ease 0.1s both' }}>
          {[
            { num: '14.5萬', label: '路燈點位' },
            { num: '5,036', label: '警察局監視器' },
            { num: 'Gemini', label: '3.6 Flash 陪聊' },
          ].map(s => (
            <div key={s.label} className="glass" style={{ flex: 1, padding: '12px 6px', borderRadius: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 900, background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.num}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Feature cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28, animation: 'fadeIn 0.8s ease 0.2s both' }}>
          {features.map(f => (
            <div key={f.title} className="glass" style={{ padding: '14px 12px', borderRadius: 18 }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{f.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeIn 0.8s ease 0.3s both' }}>
          <button
            className="btn-primary"
            style={{ padding: '18px', fontSize: 17, letterSpacing: '0.02em' }}
            onClick={onStart}
          >
            🗺️ 開始安全導航
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn-primary"
              style={{ flex: 1, background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)', padding: '14px' }}
              onClick={() => router.push('/companion')}
            >
              🎙️ 語音陪聊
            </button>
            <button
              className="btn-primary btn-danger"
              style={{ flex: 1, padding: '14px', animation: 'none' }}
              onClick={() => router.push('/sos')}
            >
              🆘 緊急 SOS
            </button>
          </div>
        </div>

      </div>

      <NavBar active="home" />
    </div>
  )
}

// ─── Route Card (展開版，選中的路線) ─────────────────────────────────────────────
function StatBox({ icon, value, label, color }: { icon: React.ReactNode; value: string | number; label: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '8px 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', color: color || 'var(--text-secondary)' }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: 14, color: color || 'white', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
    </div>
  )
}

function RouteCard({ route, onClick }: { route: ScoredRoute; onClick: () => void }) {
  return (
    <div className="route-card glass-light selected" onClick={onClick}
      style={{ border: `2px solid ${route.safety.color}66`, background: `rgba(${route.safety.color === '#10b981' ? '16,185,129' : route.safety.color === '#f59e0b' ? '245,158,11' : '239,68,68'},0.08)` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {typeIconFor(route.typeLabel, 18)}
          <span style={{ fontWeight: 800, fontSize: 15 }}>{route.typeLabel}路線</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {formatDuration(route.durationSec)}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}> ({formatDistance(route.distanceM)})</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <StatBox icon={<IconBulb size={15} />} value={route.lightCount} label="路燈" />
        <StatBox icon={<IconCamera size={15} />} value={route.cameraCount} label="監視器" />
        <StatBox icon={<IconShield size={15} />} value={`${(route.safety.total / 10).toFixed(1)}/10`} label="安全評分" color={route.safety.color} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className="map-chip" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(249,115,22,0.15)', color: '#f97316', fontSize: 11 }}><IconStore size={12} /> 24h超商</span>
        <span className="map-chip" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(30,58,138,0.25)', color: '#93c5fd', fontSize: 11 }}><IconBadge size={12} /> {route.policeCount} 派出所</span>
      </div>
    </div>
  )
}

// ─── Route Row (收合版，未選中的路線) ─────────────────────────────────────────────
function RouteRow({ route, onClick }: { route: ScoredRoute; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', borderRadius: 14,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
        {typeIconFor(route.typeLabel, 15)}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{route.typeLabel}路線</span>
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {formatDuration(route.durationSec)} <span style={{ color: 'var(--text-muted)' }}>({formatDistance(route.distanceM)})</span>
      </span>
    </div>
  )
}

// ─── Nav Bar ──────────────────────────────────────────────────────────────────
export function NavBar({ active }: { active: 'home' | 'companion' | 'sos' | 'settings' }) {
  const router = useRouter()
  const items = [
    { id: 'home', icon: '🗺️', label: '導航', path: '/' },
    { id: 'companion', icon: '🎙️', label: '陪聊', path: '/companion' },
    { id: 'sos', icon: '🆘', label: 'SOS', path: '/sos' },
    { id: 'settings', icon: '⚙️', label: '設定', path: '/settings' },
  ] as const

  return (
    <nav className="nav-bar glass" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      {items.map(item => (
        <button key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} onClick={() => router.push(item.path)}>
          <span style={{ fontSize: item.id === 'sos' ? 20 : 22 }}>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

// ─── Green Map Style (standard, natural colors) ────────────────────────────────
const darkMapStyle: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f2' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4b5563' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e5e7eb' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fde68a' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#78350f' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#a5d8e8' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#d4ecd0' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#a8d5a2' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#2f6b2f' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#eef3e8' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#e5e7eb' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#374151' }] },
]
