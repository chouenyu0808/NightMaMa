/**
 * 沿途 24 小時營業超商 (7-ELEVEN / 全家) 與警察局 (派出所) 智慧過濾與地圖標記工具
 */

export interface SafetyPlace {
  id: string
  name: string
  lat: number
  lng: number
  type: 'store' | 'police'
  vicinity?: string
  distanceToRouteM?: number
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

/** 計算地點離 Polyline 路線的最小垂直/點距離 */
function getDistanceToPolyline(lat: number, lng: number, points: Array<{ lat: number; lng: number }>): number {
  let minD = Infinity
  const step = Math.max(1, Math.floor(points.length / 40))
  for (let i = 0; i < points.length; i += step) {
    const d = haversineM(lat, lng, points[i].lat, points[i].lng)
    if (d < minD) minD = d
  }
  return minD
}

export async function searchNearbySafetyPlaces(
  map: google.maps.Map,
  points: Array<{ lat: number; lng: number }>
): Promise<SafetyPlace[]> {
  if (!google.maps.places || !points.length) return []

  const service = new google.maps.places.PlacesService(map)

  // 取 4 個分布平均的點（起點、前中點、後中點、終點）
  const sampleIndices = [
    0,
    Math.floor(points.length * 0.33),
    Math.floor(points.length * 0.66),
    points.length - 1,
  ]
  const samplePoints = sampleIndices.map(i => points[i])

  const rawStores: SafetyPlace[] = []
  const rawPolice: SafetyPlace[] = []
  const seen = new Set<string>()

  const searchPromises = samplePoints.flatMap(pt => [
    // 搜尋 24 小時超商
    new Promise<void>(resolve => {
      service.nearbySearch(
        { location: pt, radius: 300, type: 'convenience_store' },
        (res, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && res) {
            res.forEach(p => {
              if (p.geometry?.location) {
                const key = p.place_id || p.name || ''
                if (!seen.has(key)) {
                  seen.add(key)
                  const lat = p.geometry.location.lat()
                  const lng = p.geometry.location.lng()
                  const distToRoute = getDistanceToPolyline(lat, lng, points)
                  // 嚴格限制離路線 120m 以內
                  if (distToRoute <= 120) {
                    rawStores.push({
                      id: key,
                      name: p.name || '24h 超商',
                      lat,
                      lng,
                      type: 'store',
                      vicinity: p.vicinity,
                      distanceToRouteM: Math.round(distToRoute),
                    })
                  }
                }
              }
            })
          }
          resolve()
        }
      )
    }),
    // 搜尋警察局與派出所
    new Promise<void>(resolve => {
      service.nearbySearch(
        { location: pt, radius: 500, type: 'police' },
        (res, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && res) {
            res.forEach(p => {
              if (p.geometry?.location) {
                const key = p.place_id || p.name || ''
                if (!seen.has(key)) {
                  seen.add(key)
                  const lat = p.geometry.location.lat()
                  const lng = p.geometry.location.lng()
                  const distToRoute = getDistanceToPolyline(lat, lng, points)
                  if (distToRoute <= 350) {
                    rawPolice.push({
                      id: key,
                      name: p.name || '派出所 / 警察局',
                      lat,
                      lng,
                      type: 'police',
                      vicinity: p.vicinity,
                      distanceToRouteM: Math.round(distToRoute),
                    })
                  }
                }
              }
            })
          }
          resolve()
        }
      )
    }),
  ])

  await Promise.all(searchPromises)

  // 1. 去重間距：同類地點彼此至少相距 180 公尺，避免標記重疊死團
  const filteredStores: SafetyPlace[] = []
  rawStores.sort((a, b) => (a.distanceToRouteM || 0) - (b.distanceToRouteM || 0))
  for (const s of rawStores) {
    const isTooClose = filteredStores.some(
      existing => haversineM(s.lat, s.lng, existing.lat, existing.lng) < 180
    )
    if (!isTooClose) {
      filteredStores.push(s)
    }
    if (filteredStores.length >= 5) break // 全線最多顯示 5 家主要超商
  }

  const filteredPolice: SafetyPlace[] = []
  rawPolice.sort((a, b) => (a.distanceToRouteM || 0) - (b.distanceToRouteM || 0))
  for (const p of rawPolice) {
    const isTooClose = filteredPolice.some(
      existing => haversineM(p.lat, p.lng, existing.lat, existing.lng) < 250
    )
    if (!isTooClose) {
      filteredPolice.push(p)
    }
    if (filteredPolice.length >= 2) break // 全線最多顯示 2 警局
  }

  return [...filteredStores, ...filteredPolice]
}

/** 在地圖上繪製精緻清爽的 24h 超商與警察局 Marker */
export function drawSafetyPlaceMarkers(
  map: google.maps.Map,
  places: SafetyPlace[],
  infoWindow?: google.maps.InfoWindow
): google.maps.Marker[] {
  const markers: google.maps.Marker[] = []

  places.forEach(place => {
    const isStore = place.type === 'store'

    const marker = new google.maps.Marker({
      position: { lat: place.lat, lng: place.lng },
      map,
      title: place.name,
      icon: {
        url: isStore
          ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="%23F97316" stroke="%23FFFFFF" stroke-width="2"/><text x="14" y="18" font-size="13" text-anchor="middle">🏪</text></svg>'
          : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="%231E3A8A" stroke="%23FFFFFF" stroke-width="2"/><text x="15" y="19" font-size="14" text-anchor="middle">👮</text></svg>',
        scaledSize: new google.maps.Size(26, 26),
        anchor: new google.maps.Point(13, 13),
      },
      zIndex: isStore ? 25 : 35,
    })

    if (infoWindow) {
      marker.addListener('click', () => {
        const content = `
          <div style="padding: 6px 10px; color: #111827; font-family: sans-serif;">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 2px;">
              ${isStore ? '🏪 24h 明亮超商' : '👮 警察局 / 派出所'}
            </div>
            <div style="font-size: 13px; font-weight: 600; color: #1f2937;">${place.name}</div>
            ${place.vicinity ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${place.vicinity}</div>` : ''}
            <div style="font-size: 10px; color: #10b981; margin-top: 4px; font-weight: 600;">● 沿線 24h 治安防護據點</div>
          </div>
        `
        infoWindow.setContent(content)
        infoWindow.open(map, marker)
      })
    }

    markers.push(marker)
  })

  return markers
}
