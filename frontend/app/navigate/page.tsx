'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { loadMaps, decodePolyline, formatDuration, formatDistance } from '@/lib/maps'
import { NavBar } from '@/app/page'

function NavigateContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<google.maps.Map | null>(null)
  const userMarkerRef = useRef<google.maps.Marker | null>(null)
  const watchIdRef = useRef<number | null>(null)

  const polylineStr = searchParams.get('polyline') || ''
  const origin = searchParams.get('origin') || ''
  const destination = searchParams.get('destination') || ''
  const durationSec = parseInt(searchParams.get('duration') || '0')
  const distanceM = parseInt(searchParams.get('distance') || '0')
  const safetyScore = parseInt(searchParams.get('safety') || '0')
  const lightCount = parseInt(searchParams.get('lights') || '0')
  const cctvCount = parseInt(searchParams.get('cctv') || '0')

  const [elapsed, setElapsed] = useState(0)
  const [remainingSec, setRemainingSec] = useState(durationSec)

  const safetyColor = safetyScore >= 65 ? '#10b981' : safetyScore >= 40 ? '#f59e0b' : '#ef4444'
  const safetyLabel = safetyScore >= 65 ? '安全' : safetyScore >= 40 ? '普通' : '注意'

  useEffect(() => {
    loadMaps().then(() => {
      if (!mapRef.current) return
      const points = decodePolyline(polylineStr)
      if (!points.length) return

      mapInstance.current = new google.maps.Map(mapRef.current, {
        center: points[0],
        zoom: 16,
        disableDefaultUI: true,
        gestureHandling: 'greedy',
        styles: darkMapStyle,
      })

      // Draw route
      new google.maps.Polyline({
        path: points,
        map: mapInstance.current,
        strokeColor: safetyColor,
        strokeWeight: 6,
        strokeOpacity: 0.9,
      })

      // Start + end markers
      new google.maps.Marker({
        position: points[0],
        map: mapInstance.current!,
        title: origin,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#8b5cf6', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
      })
      new google.maps.Marker({
        position: points[points.length - 1],
        map: mapInstance.current!,
        title: destination,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#10b981', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
      })

      // User location tracking
      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          pos => {
            const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            if (!userMarkerRef.current) {
              userMarkerRef.current = new google.maps.Marker({
                position: userPos,
                map: mapInstance.current!,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 12,
                  fillColor: '#3b82f6',
                  fillOpacity: 1,
                  strokeColor: 'white',
                  strokeWeight: 3,
                },
                zIndex: 100,
              })
            } else {
              userMarkerRef.current.setPosition(userPos)
            }
            mapInstance.current?.panTo(userPos)
          },
          null,
          { enableHighAccuracy: true }
        )
      }

      // Fit bounds
      const bounds = new google.maps.LatLngBounds()
      points.forEach(p => bounds.extend(p))
      mapInstance.current.fitBounds(bounds, { top: 60, bottom: 220, left: 20, right: 20 })
    })

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [polylineStr, safetyColor, origin, destination])

  // Timer
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(e => e + 1)
      setRemainingSec(r => Math.max(0, r - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
      {/* Map */}
      <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Top info bar */}
      <div className="glass" style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '48px 16px 14px',
        zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()} className="btn-icon" style={{ width: 36, height: 36, fontSize: 16 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>導航中 🚶</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>→ {destination}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: safetyColor, fontWeight: 700, fontSize: 20 }}>{safetyScore}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{safetyLabel}</div>
          </div>
        </div>
      </div>

      {/* Bottom panel */}
      <div className="glass bottom-sheet" style={{ zIndex: 20 }}>
        <div className="bottom-sheet-handle" />

        {/* Stats row */}
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 16 }}>
          {[
            { icon: '⏱️', value: formatDuration(remainingSec), label: '剩餘時間' },
            { icon: '📏', value: formatDistance(distanceM), label: '總距離' },
            { icon: '💡', value: `${lightCount}`, label: '路燈' },
            { icon: '📹', value: `${cctvCount}`, label: '監視器' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18 }}>{stat.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-primary"
            style={{ flex: 1, background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}
            onClick={() => router.push(`/companion?origin=${origin}&destination=${destination}&safety=${safetyScore}&duration=${remainingSec}`)}
          >
            🎙️ 語音陪聊
          </button>
          <button
            className="btn-primary btn-danger"
            style={{ flex: 1 }}
            onClick={() => router.push('/sos')}
          >
            🆘 SOS
          </button>
        </div>
      </div>
    </div>
  )
}

// same dark map style
const darkMapStyle: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c1929' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0f1f35' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0a1a10' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
]

export default function NavigatePage() {
  return (
    <Suspense fallback={<div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>載入地圖中…</div>}>
      <NavigateContent />
    </Suspense>
  )
}
