/**
 * 沿途 24 小時營業「台灣四大超商」(7-11, 全家, 萊爾富, OK) 與警察局智慧過濾與地圖標記工具
 */

export interface SafetyPlace {
  id: string
  name: string
  lat: number
  lng: number
  type: 'store' | 'police'
  brand?: '7-11' | '全家' | '萊爾富' | 'OK'
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

/** 判斷是否為台灣四大超商 (7-ELEVEN, 全家, 萊爾富, OK) */
function isTaiwanBigFourStore(name: string): boolean {
  const n = name.toLowerCase()
  return (
    n.includes('7-eleven') ||
    n.includes('7-11') ||
    n.includes('711') ||
    n.includes('統一超商') ||
    n.includes('familymart') ||
    n.includes('全家') ||
    n.includes('hi-life') ||
    n.includes('萊爾富') ||
    n.includes('ok mart') ||
    n.includes('ok超商') ||
    n.includes('ok便利')
  )
}

function getStoreBrand(name: string): '7-11' | '全家' | '萊爾富' | 'OK' {
  const n = name.toLowerCase()
  if (n.includes('7-eleven') || n.includes('7-11') || n.includes('711') || n.includes('統一超商')) return '7-11'
  if (n.includes('familymart') || n.includes('全家')) return '全家'
  if (n.includes('hi-life') || n.includes('萊爾富')) return '萊爾富'
  return 'OK'
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
    // 搜尋台灣四大超商 (7-11, 全家, 萊爾富, OK)
    new Promise<void>(resolve => {
      service.nearbySearch(
        { location: pt, radius: 350, type: 'convenience_store' },
        (res, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && res) {
            res.forEach(p => {
              if (p.geometry?.location && p.name) {
                // 嚴格限制四大超商
                if (isTaiwanBigFourStore(p.name)) {
                  const key = p.place_id || p.name
                  if (!seen.has(key)) {
                    seen.add(key)
                    const lat = p.geometry.location.lat()
                    const lng = p.geometry.location.lng()
                    const distToRoute = getDistanceToPolyline(lat, lng, points)
                    if (distToRoute <= 120) {
                      rawStores.push({
                        id: key,
                        name: p.name,
                        lat,
                        lng,
                        type: 'store',
                        brand: getStoreBrand(p.name),
                        vicinity: p.vicinity,
                        distanceToRouteM: Math.round(distToRoute),
                      })
                    }
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
        { location: pt, radius: 550, type: 'police' },
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

  // 1. 超商同品牌/位置相距至少 160 公尺
  const filteredStores: SafetyPlace[] = []
  rawStores.sort((a, b) => (a.distanceToRouteM || 0) - (b.distanceToRouteM || 0))
  for (const s of rawStores) {
    const isTooClose = filteredStores.some(
      existing => haversineM(s.lat, s.lng, existing.lat, existing.lng) < 160
    )
    if (!isTooClose) {
      filteredStores.push(s)
    }
    if (filteredStores.length >= 6) break // 全線最多顯示 6 家四大超商
  }

  // 2. 警察局
  const filteredPolice: SafetyPlace[] = []
  rawPolice.sort((a, b) => (a.distanceToRouteM || 0) - (b.distanceToRouteM || 0))
  for (const p of rawPolice) {
    const isTooClose = filteredPolice.some(
      existing => haversineM(p.lat, p.lng, existing.lat, existing.lng) < 250
    )
    if (!isTooClose) {
      filteredPolice.push(p)
    }
    if (filteredPolice.length >= 2) break
  }

  return [...filteredStores, ...filteredPolice]
}

/** 在地圖上繪製台灣四大超商 (7-11, 全家, 萊爾富, OK) 與警察局專屬品牌圖示 */
export function drawSafetyPlaceMarkers(
  map: google.maps.Map,
  places: SafetyPlace[],
  infoWindow?: google.maps.InfoWindow
): google.maps.Marker[] {
  const markers: google.maps.Marker[] = []

  places.forEach(place => {
    const isStore = place.type === 'store'
    let iconBg = '%23F97316' // default orange
    let brandTag = '24h 超商'

    if (isStore) {
      if (place.brand === '7-11') {
        iconBg = '%2300843D' // 7-11 Green
        brandTag = '7-ELEVEN (24h)'
      } else if (place.brand === '全家') {
        iconBg = '%23009944' // FamilyMart Green/Blue
        brandTag = '全家 FamilyMart (24h)'
      } else if (place.brand === '萊爾富') {
        iconBg = '%23E60012' // Hi-Life Red
        brandTag = '萊爾富 Hi-Life (24h)'
      } else if (place.brand === 'OK') {
        iconBg = '%23D9232E' // OK Mart Red
        brandTag = 'OK Mart (24h)'
      }
    }

    const marker = new google.maps.Marker({
      position: { lat: place.lat, lng: place.lng },
      map,
      title: `${place.name} (${brandTag})`,
      icon: {
        url: isStore
          ? `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="${iconBg}" stroke="%23FFFFFF" stroke-width="2"/><text x="16" y="21" font-size="15" text-anchor="middle">🏪</text></svg>`
          : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="%231E3A8A" stroke="%23FFFFFF" stroke-width="2"/><text x="17" y="22" font-size="16" text-anchor="middle">👮</text></svg>',
        scaledSize: new google.maps.Size(30, 30),
        anchor: new google.maps.Point(15, 15),
      },
      zIndex: isStore ? 30 : 40,
    })

    if (infoWindow) {
      marker.addListener('click', () => {
        const content = `
          <div style="padding: 8px 12px; color: #111827; font-family: sans-serif;">
            <div style="font-weight: 700; font-size: 13px; color: ${isStore ? '#059669' : '#1e3a8a'}; margin-bottom: 2px;">
              ${isStore ? `🏪 24h 明亮超商 · ${place.brand || '連鎖門市'}` : '👮 警察局 / 派出所'}
            </div>
            <div style="font-size: 14px; font-weight: 700; color: #111827;">${place.name}</div>
            ${place.vicinity ? `<div style="font-size: 11px; color: #6b7280; margin-top: 3px;">${place.vicinity}</div>` : ''}
            <div style="font-size: 11px; color: #059669; margin-top: 5px; font-weight: 600;">● 24小時明亮治安防護點</div>
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
