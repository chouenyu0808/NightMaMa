import { NextResponse } from 'next/server'

interface AnxietyReport {
  id: string
  lat: number
  lng: number
  reason: string
  reported_at: string
}

// Global in-memory report store (initialized with default Taipei safe points)
const reportsStore: AnxietyReport[] = [
  {
    id: '1',
    lat: 25.042,
    lng: 121.56,
    reason: '疑似有人跟隨',
    reported_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '2',
    lat: 25.038,
    lng: 121.552,
    reason: '路燈故障 / 巷弄極暗',
    reported_at: new Date(Date.now() - 7200000).toISOString(),
  },
]

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL

export async function GET() {
  // If external Cloud Run / FastAPI backend is configured, attempt to fetch from it
  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/report`, { next: { revalidate: 10 } }).catch(() => null)
      if (res && res.ok) {
        const data = await res.json().catch(() => null)
        if (data && Array.isArray(data.reports)) {
          return NextResponse.json(data)
        }
      }
    } catch {
      // Fallback to local memory store
    }
  }

  return NextResponse.json({ success: true, reports: reportsStore })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { lat, lng, category, address } = body || {}

    const newReport: AnxietyReport = {
      id: String(Date.now()),
      lat: Number(lat) || 25.038,
      lng: Number(lng) || 121.552,
      reason: category || '感到不安 / 留存紀錄',
      reported_at: new Date().toISOString(),
    }

    reportsStore.unshift(newReport)

    // Optionally forward to Python FastAPI backend if configured
    if (BACKEND_URL) {
      fetch(`${BACKEND_URL}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: newReport.lat,
          lng: newReport.lng,
          reason: newReport.reason,
          address: address || '',
        }),
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, report: newReport })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
