'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { loadMaps, fetchRoutes, formatDuration, formatDistance, type RouteResult, type LatLng } from '@/lib/maps'

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

export default function HomePage() {
  const router = useRouter()
  const [appState, setAppState] = useState<AppState>('landing')

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<google.maps.Map | null>(null)
  const polylinesRef = useRef<google.maps.Polyline[]>([])
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

    // Auto fit bounds to full route
    const bounds = new google.maps.LatLngBounds()
    points.forEach(p => bounds.extend(p))

    // Top padding: ~110px if collapsed, ~240px if expanded
    const topPad = searchCollapsed ? 110 : 240
    // Bottom padding: ~90px if collapsed, ~240px if expanded
    const bottomPad = sheetCollapsed ? 90 : 240

    mapInstance.current!.fitBounds(bounds, {
      top: topPad,
      bottom: bottomPad,
      left: 35,
      right: 35,
    })
  }, [])

  const handleSearch = async () => {
    if (!origin.trim() || !destination.trim()) {
      setError('請輸入出發地與目的地')
      return
    }
    if (!originLatLng || !destLatLng) {
      setError('請從建議清單中選擇出發地與目的地')
      return
    }
    setError('')
    setIsLoading(true)
    setShowSheet(false)

    try {
      const rawRoutes = await fetchRoutes(originLatLng, destLatLng)
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

  const toggleCollapse = () => {
    const nextState = !isSheetCollapsed
    setIsSheetCollapsed(nextState)
    if (routes.length > 0) {
      drawRoutes(routes, selectedIdx, nextState, isSearchCollapsed)
    }
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
    })
    router.push(`/navigate?${params}`)
  }

  if (appState === 'landing') {
    return <LandingPage onStart={() => setAppState('map')} />
  }

  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
      {/* Map */}
      <div ref={mapRef} style={{ position: 'absolute', inset: 0, background: '#0f172a' }} />

      {/* Top search panel */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '52px 16px 16px',
        background: 'linear-gradient(to bottom, rgba(10,14,26,0.97) 80%, transparent)',
        zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={() => setAppState('landing')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>←</button>
          <span style={{ fontSize: 20 }}>🌙</span>
          <span style={{ fontSize: 18, fontWeight: 900 }} className="gradient-text">NightMaMa</span>
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
            <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, paddingRight: 8 }}>
              📍 {origin.split('區')[1] || origin.slice(0, 10)} → 🏠 {destination.split('區')[1] || destination.slice(0, 10)}
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
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>📍</span>
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
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>🏠</span>
              <input
                ref={destInputRef}
                className="input-field"
                style={{ paddingLeft: 42 }}
                placeholder="目的地"
                value={destination}
                onChange={e => { setDestination(e.target.value); setDestLatLng(null) }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: 13, paddingLeft: 4 }}>{error}</p>}
            <button className="btn-primary" onClick={handleSearch} disabled={isLoading}>
              {isLoading ? '⏳ 計算安全路線中…' : '🔍 找最安全路線'}
            </button>
          </div>
        )}
      </div>

      {/* Route bottom sheet */}
      {showSheet && routes.length > 0 && (
        <div
          className="bottom-sheet glass"
          style={{
            bottom: '64px',
            paddingBottom: isSheetCollapsed ? '12px' : '20px',
            maxHeight: isSheetCollapsed ? '70px' : '52dvh',
            zIndex: 60,
            overflow: 'hidden',
            transition: 'all 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          <div
            onClick={toggleCollapse}
            style={{ cursor: 'pointer', padding: '4px 0 8px' }}
          >
            <div className="bottom-sheet-handle" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                找到 {routes.length} 條路線 · 依安全評分排序 ↓
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '30dvh', overflowY: 'auto' }} className="scrollable">
                {routes.map((route, i) => (
                  <RouteCard key={i} route={route} isSelected={selectedIdx === i} onClick={() => handleSelectRoute(i)} />
                ))}
              </div>
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={handleStartNavigation}>
                🚶 開始導航 · {routes[selectedIdx]?.safety.label}路線
              </button>
            </>
          )}
        </div>
      )}

      <NavBar active="home" />
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
    { icon: '📹', title: '監視器覆蓋率', desc: '417 支 CCTV，守護每條路段' },
    { icon: '🎙️', title: 'AI 語音陪聊', desc: 'Gemini 全程陪伴，化解夜行焦慮' },
    { icon: '🆘', title: '一鍵緊急通知', desc: 'LINE 即時定位發送給緊急聯絡人' },
  ]

  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 0%, #1a0a2e 0%, #0a0e1a 60%)' }}>
      {/* Star canvas */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      {/* Glow orbs */}
      <div style={{ position: 'absolute', top: '8%', left: '20%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '15%', right: '10%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="scrollable" style={{ position: 'relative', zIndex: 10, height: '100%', display: 'flex', flexDirection: 'column', padding: '60px 24px 100px', gap: 0 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32, animation: 'fadeIn 0.8s ease' }}>
          <div style={{ fontSize: 56, marginBottom: 8, filter: 'drop-shadow(0 0 20px rgba(139,92,246,0.6))' }}>🌙</div>
          <h1 style={{ fontSize: 38, fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>
            <span className="gradient-text">NightMaMa</span>
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.05em' }}>
            夜間安全導航 · AI 守護每一步
          </p>
        </div>

        {/* Hero stats */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, animation: 'fadeIn 0.8s ease 0.1s both' }}>
          {[
            { num: '14.5萬', label: '路燈點位' },
            { num: '417', label: '監視器' },
            { num: 'AI', label: 'Gemini 陪聊' },
          ].map(s => (
            <div key={s.label} className="glass" style={{ flex: 1, padding: '12px 8px', borderRadius: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.num}</div>
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

// ─── Route Card ───────────────────────────────────────────────────────────────
function RouteCard({ route, isSelected, onClick }: { route: ScoredRoute; isSelected: boolean; onClick: () => void }) {
  const scoreClass = route.safety.total >= 65 ? 'score-high' : route.safety.total >= 40 ? 'score-mid' : 'score-low'
  const typeIcon = route.typeLabel === '最安全' ? '🛡️' : route.typeLabel === '最快' ? '⚡' : '⚖️'

  return (
    <div className={`route-card glass-light ${isSelected ? 'selected' : ''}`} onClick={onClick}
      style={{ border: isSelected ? `2px solid ${route.safety.color}44` : '2px solid transparent', background: isSelected ? `rgba(${route.safety.color === '#10b981' ? '16,185,129' : route.safety.color === '#f59e0b' ? '245,158,11' : '239,68,68'},0.06)` : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{typeIcon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{route.typeLabel}路線</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {formatDuration(route.durationSec)} · {formatDistance(route.distanceM)}
              {route.extraMin > 0 && <span style={{ color: 'var(--text-muted)' }}> (+{route.extraMin}分)</span>}
            </div>
          </div>
        </div>
        <div className={`score-badge ${scoreClass}`}>{route.safety.emoji} {route.safety.total}</div>
      </div>
      <div className="safety-meter" style={{ marginBottom: 8 }}>
        <div className="safety-meter-fill" style={{ width: `${route.safety.total}%`, background: `linear-gradient(90deg, ${route.safety.color}66, ${route.safety.color})` }} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{route.description}</p>
      <div style={{ display: 'flex', gap: 6 }}>
        <span className="map-chip" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontSize: 11 }}>💡 {route.lightCount} 路燈</span>
        <span className="map-chip" style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', fontSize: 11 }}>📹 {route.cameraCount} 監視器</span>
      </div>
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

// ─── Dark Map Style ────────────────────────────────────────────────────────────
const darkMapStyle: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c1929' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0f1f35' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0a1a10' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
]
