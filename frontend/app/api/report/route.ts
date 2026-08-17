import { NextRequest, NextResponse } from 'next/server'

interface ReportItem {
  id: string
  lat: number
  lng: number
  category: string
  address?: string
  timestamp: number
}

// In-memory store for anxiety reports (pre-populated with realistic Taiwan night-walking spots)
const globalReports: ReportItem[] = [
  { id: '1', lat: 25.0185, lng: 121.5350, category: '💡 路燈故障 / 巷弄極暗', address: '台北市大安區泰興街220巷', timestamp: Date.now() - 3600000 },
  { id: '2', lat: 25.0210, lng: 121.5320, category: '👤 疑似有人跟隨', address: '台北市大安區新生南路三段', timestamp: Date.now() - 7200000 },
  { id: '3', lat: 25.0245, lng: 121.5290, category: '🔊 異常聲響 / 可疑群聚', address: '台北市大安區和平東路二段', timestamp: Date.now() - 14400000 },
]

export async function GET() {
  return NextResponse.json({ reports: globalReports })
}

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, category, address } = await req.json()
    if (!lat || !lng || !category) {
      return NextResponse.json({ error: 'Missing lat, lng or category' }, { status: 400 })
    }

    const newItem: ReportItem = {
      id: crypto.randomUUID(),
      lat: Number(lat),
      lng: Number(lng),
      category,
      address: address || `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`,
      timestamp: Date.now(),
    }

    globalReports.unshift(newItem)
    if (globalReports.length > 50) globalReports.pop()

    return NextResponse.json({ success: true, report: newItem })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Report failed' }, { status: 500 })
  }
}
