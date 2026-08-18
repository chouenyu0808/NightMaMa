/**
 * 沿途 24 小時營業「台灣便利商店」與「警察局 / 派出所」全涵蓋地圖標記工具
 */
import { escapeHtml } from './escapeHtml'

export interface SafetyPlace {
  id: string
  name: string
  lat: number
  lng: number
  type: 'store' | 'police'
  brand?: '7-11' | '全家' | '萊爾富' | 'OK' | '其他超商'
  vicinity?: string
  distanceToRouteM?: number
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

function getStoreBrand(name: string): '7-11' | '全家' | '萊爾富' | 'OK' | '其他超商' {
  const n = name.toLowerCase()
  if (n.includes('7-eleven') || n.includes('7-11') || n.includes('711') || n.includes('統一超商')) return '7-11'
  if (n.includes('familymart') || n.includes('全家')) return '全家'
  if (n.includes('hi-life') || n.includes('萊爾富')) return '萊爾富'
  if (n.includes('ok mart') || n.includes('ok超商') || n.includes('ok便利')) return 'OK'
  return '其他超商'
}

/** 計算地點離 Polyline 路線的最小點距離 */
function getDistanceToPolyline(lat: number, lng: number, points: Array<{ lat: number; lng: number }>): number {
  let minD = Infinity
  const step = Math.max(1, Math.floor(points.length / 80))
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

  // 每隔約 500 公尺取一個採樣點（搭配 600m 半徑），高效涵蓋沿線所有超商與警局
  const samplePoints: Array<{ lat: number; lng: number }> = []
  let lastPt = points[0]
  samplePoints.push(lastPt)

  for (let i = 1; i < points.length; i++) {
    const dist = haversineM(lastPt.lat, lastPt.lng, points[i].lat, points[i].lng)
    if (dist >= 500 || i === points.length - 1) {
      samplePoints.push(points[i])
      lastPt = points[i]
    }
  }

  const rawStores: SafetyPlace[] = []
  const rawPolice: SafetyPlace[] = []
  const seen = new Set<string>()

  // 批次進行地理周邊搜尋
  const searchPromises = samplePoints.flatMap(pt => [
    // 1. 搜尋全類別便利商店
    new Promise<void>(resolve => {
      service.nearbySearch(
        { location: pt, radius: 600, type: 'convenience_store' },
        (res, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && res) {
            res.forEach(p => {
              if (p.geometry?.location && p.name) {
                const key = p.place_id || p.name
                if (!seen.has(key)) {
                  seen.add(key)
                  const lat = p.geometry.location.lat()
                  const lng = p.geometry.location.lng()
                  const distToRoute = getDistanceToPolyline(lat, lng, points)
                  // 路線周邊 250 公尺內的所有便利商店全數納入
                  if (distToRoute <= 250) {
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
            })
          }
          resolve()
        }
      )
    }),
    // 2. 搜尋警察局、派出所、分局
    new Promise<void>(resolve => {
      service.nearbySearch(
        { location: pt, radius: 800, type: 'police' },
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
                  // 路線周邊 800 公尺內的所有警局全數納入
                  if (distToRoute <= 800) {
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

  // 剔除重複位置過近（50公尺內）的地標，其餘全數保留標示
  const filteredStores: SafetyPlace[] = []
  rawStores.sort((a, b) => (a.distanceToRouteM || 0) - (b.distanceToRouteM || 0))
  for (const s of rawStores) {
    const isDuplicate = filteredStores.some(
      existing => haversineM(s.lat, s.lng, existing.lat, existing.lng) < 50
    )
    if (!isDuplicate) {
      filteredStores.push(s)
    }
  }

  const filteredPolice: SafetyPlace[] = []
  rawPolice.sort((a, b) => (a.distanceToRouteM || 0) - (b.distanceToRouteM || 0))
  for (const p of rawPolice) {
    const isDuplicate = filteredPolice.some(
      existing => haversineM(p.lat, p.lng, existing.lat, existing.lng) < 80
    )
    if (!isDuplicate) {
      filteredPolice.push(p)
    }
  }

  return [...filteredStores, ...filteredPolice]
}

/** 在地圖上繪製所有台灣便利商店與警察局地標標記 */
export function drawSafetyPlaceMarkers(
  map: google.maps.Map,
  places: SafetyPlace[],
  infoWindow?: google.maps.InfoWindow
): google.maps.Marker[] {
  const markers: google.maps.Marker[] = []
  const sharedInfoWindow = infoWindow || new google.maps.InfoWindow()

  places.forEach(place => {
    const isStore = place.type === 'store'
    let iconBg = '%23F97316' // default orange
    let brandTag = '24h 便利商店'

    if (isStore) {
      if (place.brand === '7-11') {
        iconBg = '%2300843D' // 7-11 Green
        brandTag = '7-ELEVEN'
      } else if (place.brand === '全家') {
        iconBg = '%23009944' // FamilyMart Green
        brandTag = '全家 FamilyMart'
      } else if (place.brand === '萊爾富') {
        iconBg = '%23E60012' // Hi-Life Red
        brandTag = '萊爾富 Hi-Life'
      } else if (place.brand === 'OK') {
        iconBg = '%23D9232E' // OK Mart Red
        brandTag = 'OK Mart'
      }
    }

    const marker = new google.maps.Marker({
      position: { lat: place.lat, lng: place.lng },
      map,
      title: `${place.name} (${brandTag})`,
      icon: {
        url: isStore
          ? `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="${iconBg}" stroke="%23FFFFFF" stroke-width="2"/><text x="17" y="22" font-size="16" text-anchor="middle">🏪</text></svg>`
          : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="%231E3A8A" stroke="%23FFFFFF" stroke-width="2.5"/><text x="18" y="24" font-size="18" text-anchor="middle">👮</text></svg>',
        scaledSize: new google.maps.Size(32, 32),
        anchor: new google.maps.Point(16, 16),
      },
      zIndex: isStore ? 100 : 150,
    })

    marker.addListener('click', () => {
      const content = `
        <div style="padding: 10px 14px; color: #111827; font-family: system-ui, sans-serif; min-width: 180px;">
          <div style="font-weight: 700; font-size: 13px; color: ${isStore ? '#059669' : '#1e3a8a'}; margin-bottom: 3px;">
            ${isStore ? `🏪 24h 明亮超商 · ${escapeHtml(place.brand)}` : '👮 警察局 / 派出所'}
          </div>
          <div style="font-size: 15px; font-weight: 800; color: #111827;">${escapeHtml(place.name)}</div>
          ${place.vicinity ? `<div style="font-size: 12px; color: #4b5563; margin-top: 4px;">${escapeHtml(place.vicinity)}</div>` : ''}
          <div style="font-size: 11px; color: #059669; margin-top: 6px; font-weight: 700; background: #ECFDF5; padding: 3px 8px; border-radius: 6px; display: inline-block;">
            距離路線約 ${Number(place.distanceToRouteM) || 0} 公尺 · 夜間安全防護點
          </div>
        </div>
      `
      sharedInfoWindow.setContent(content)
      sharedInfoWindow.open(map, marker)
    })

    markers.push(marker)
  })

  return markers
}

/** /api/report 回傳的通報項目。內容為使用者提交，一律視為不可信字串。 */
/**
 * /api/report 回傳的通報項目。內容為使用者提交，一律視為不可信字串。
 *
 * 欄位名同時支援兩組：Next.js 的記憶體儲存用 reason/reported_at，
 * Python 後端的 Firestore 記錄用 category/timestamp。後端網址一設好，
 * 回傳就會從前者換成後者 —— 只認一組會讓標題與時間變成空白。
 */
interface AnxietyReportPin {
  id?: string
  lat: number | string
  lng: number | string
  reason?: string
  reported_at?: string
  category?: string
  timestamp?: number
}

/** 在地圖上繪製「社區不安通報治安熱點」標記 */
export async function drawAnxietyReportMarkers(
  map: google.maps.Map,
  infoWindow?: google.maps.InfoWindow
): Promise<google.maps.Marker[]> {
  try {
    const res = await fetch('/api/report').catch(() => null)
    if (!res || !res.ok) return []
    const data = await res.json().catch(() => null)
    if (!data || !Array.isArray(data.reports)) return []
    const reports = data.reports

    const sharedInfoWindow = infoWindow || new google.maps.InfoWindow()
    const markers: google.maps.Marker[] = []

    reports.forEach((rep: AnxietyReportPin) => {
      const lat = Number(rep.lat)
      const lng = Number(rep.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        // Marker title 是純文字屬性，不會被當成 HTML 解析
        title: `⚠️ 不安通報：${rep.reason ?? rep.category ?? ''}`,
        icon: {
          url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="%23DC2626" stroke="%23FFFFFF" stroke-width="2.5"/><text x="17" y="22" font-size="16" text-anchor="middle">⚠️</text></svg>',
          scaledSize: new google.maps.Size(30, 30),
          anchor: new google.maps.Point(15, 15),
        },
        zIndex: 200,
      })

      marker.addListener('click', () => {
        const reportedAt = new Date(rep.reported_at ?? rep.timestamp ?? '')
        const timeStr = Number.isNaN(reportedAt.getTime())
          ? '時間不明'
          : reportedAt.toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' })
        const content = `
          <div style="padding: 10px 14px; color: #111827; font-family: system-ui, sans-serif; min-width: 200px;">
            <div style="font-weight: 800; font-size: 13px; color: #DC2626; margin-bottom: 3px;">
              ⚠️ 夜間治安不安通報熱點
            </div>
            <div style="font-size: 15px; font-weight: 800; color: #111827;">${escapeHtml(rep.reason ?? rep.category ?? '未分類')}</div>
            <div style="font-size: 12px; color: #4B5563; margin-top: 4px;">通報時間：${escapeHtml(timeStr)}</div>
            <div style="font-size: 11px; color: #DC2626; margin-top: 6px; font-weight: 700; background: #FEE2E2; padding: 3px 8px; border-radius: 6px; display: inline-block;">
              ● 社區通報紀錄點（僅供參考，未納入路線計算）
            </div>
          </div>
        `
        sharedInfoWindow.setContent(content)
        sharedInfoWindow.open(map, marker)
      })

      markers.push(marker)
    })

    return markers
  } catch {
    return []
  }
}

