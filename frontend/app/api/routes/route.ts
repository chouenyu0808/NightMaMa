import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { origin, destination, alternatives = true } = await req.json()

    if (!origin || !destination) {
      return NextResponse.json({ error: '出發地與目的地不可為空' }, { status: 400 })
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || process.env.GOOGLE_MAPS_KEY

    if (!apiKey) {
      return NextResponse.json({ error: '伺服器未設定 MAPS_KEY' }, { status: 500 })
    }

    const body = {
      origin: { address: origin },
      destination: { address: destination },
      travelMode: 'WALK',
      computeAlternativeRoutes: alternatives,
      languageCode: 'zh-TW',
      units: 'METRIC',
    }

    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (!res.ok) {
      const msg = data?.error?.message || data?.message || `HTTP ${res.status}`
      return NextResponse.json({ error: `Routes API 錯誤：${msg}` }, { status: res.status })
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '路線查詢失敗' }, { status: 500 })
  }
}
