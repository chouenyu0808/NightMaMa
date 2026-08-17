/**
 * 沿途 24 小時超商 (7-ELEVEN / 全家) 與警察局 (派出所) 搜尋與地圖標記工具
 */

export interface SafetyPlace {
  id: string
  name: string
  lat: number
  lng: number
  type: 'store' | 'police'
  vicinity?: string
}

export async function searchNearbySafetyPlaces(
  map: google.maps.Map,
  points: Array<{ lat: number; lng: number }>
): Promise<SafetyPlace[]> {
  if (!google.maps.places || !points.length) return []

  const service = new google.maps.places.PlacesService(map)

  // 採樣路線點位 (起點、中點、終點)
  const sampleIndices = [0, Math.floor(points.length / 2), points.length - 1]
  const samplePoints = sampleIndices.map(i => points[i])

  const results: SafetyPlace[] = []
  const seen = new Set<string>()

  const searchPromises = samplePoints.flatMap(pt => [
    // 搜尋 24 小時超商 (7-11, 全家, 萊爾富, OK)
    new Promise<void>(resolve => {
      service.nearbySearch(
        { location: pt, radius: 450, type: 'convenience_store' },
        (res, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && res) {
            res.forEach(p => {
              if (p.geometry?.location) {
                const key = p.place_id || p.name || ''
                if (!seen.has(key)) {
                  seen.add(key)
                  results.push({
                    id: key,
                    name: p.name || '24h 便利超商',
                    lat: p.geometry.location.lat(),
                    lng: p.geometry.location.lng(),
                    type: 'store',
                    vicinity: p.vicinity,
                  })
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
        { location: pt, radius: 700, type: 'police' },
        (res, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && res) {
            res.forEach(p => {
              if (p.geometry?.location) {
                const key = p.place_id || p.name || ''
                if (!seen.has(key)) {
                  seen.add(key)
                  results.push({
                    id: key,
                    name: p.name || '派出所 / 警察局',
                    lat: p.geometry.location.lat(),
                    lng: p.geometry.location.lng(),
                    type: 'police',
                    vicinity: p.vicinity,
                  })
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
  return results
}

/** 在地圖上繪製 24h 超商與警察局圖示 Marker */
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
          ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="%23F97316" stroke="%23FFFFFF" stroke-width="2"/><text x="18" y="23" font-size="18" text-anchor="middle">🏪</text></svg>'
          : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="%231E3A8A" stroke="%23FFFFFF" stroke-width="2"/><text x="18" y="23" font-size="18" text-anchor="middle">👮</text></svg>',
        scaledSize: new google.maps.Size(32, 32),
        anchor: new google.maps.Point(16, 16),
      },
      zIndex: isStore ? 30 : 40,
    })

    if (infoWindow) {
      marker.addListener('click', () => {
        const content = `
          <div style="padding: 6px 10px; color: #111827; font-family: sans-serif;">
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 2px;">
              ${isStore ? '🏪 24h 明亮超商' : '👮 警察局 / 派出所'}
            </div>
            <div style="font-size: 13px; font-weight: 600; color: #1f2937;">${place.name}</div>
            ${place.vicinity ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${place.vicinity}</div>` : ''}
            <div style="font-size: 10px; color: #10b981; margin-top: 4px; font-weight: 600;">● 24小時治安防護中</div>
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
