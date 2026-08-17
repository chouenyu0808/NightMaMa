import { NextRequest, NextResponse } from 'next/server'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rateLimit'

interface AnxietyReport {
  id: string
  lat: number
  lng: number
  reason: string
  reported_at: string
}

/**
 * ⚠️ 暫時性的 module-level 記憶體儲存。
 *
 * 已知限制（尚未修正，需要接回 backend/routers/report.py 的 BigQuery 版本）：
 * - Cloud Run 多實例之間不共享，使用者看到的通報點會因為打到哪個實例而不同
 * - 每次重新部署或實例回收就全部消失
 *
 * 目前至少加上筆數上限，避免長時間執行時記憶體無限成長。
 */
const MAX_STORED_REPORTS = 500

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

/** 前端 AnxietyReportModal 提供的固定分類，避免任意字串被存進來並顯示給其他使用者。 */
const ALLOWED_REASONS = new Set([
  '疑似有人跟隨',
  '路燈故障 / 巷弄極暗',
  '異常聲響 / 可疑群聚',
  '感到不安 / 留存紀錄',
])
const DEFAULT_REASON = '感到不安 / 留存紀錄'

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000

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

export async function POST(req: NextRequest) {
  const limit = rateLimit(`report:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: '無效的請求內容' }, { status: 400 })
  }

  const { lat, lng, category, address } = (body ?? {}) as {
    lat?: unknown
    lng?: unknown
    category?: unknown
    address?: unknown
  }

  const latNum = Number(lat)
  const lngNum = Number(lng)
  if (
    !Number.isFinite(latNum) || latNum < -90 || latNum > 90 ||
    !Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180
  ) {
    return NextResponse.json({ success: false, error: '座標無效' }, { status: 400 })
  }

  const reason =
    typeof category === 'string' && ALLOWED_REASONS.has(category) ? category : DEFAULT_REASON

  const newReport: AnxietyReport = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lat: latNum,
    lng: lngNum,
    reason,
    reported_at: new Date().toISOString(),
  }

  reportsStore.unshift(newReport)
  if (reportsStore.length > MAX_STORED_REPORTS) {
    reportsStore.length = MAX_STORED_REPORTS
  }

  // Optionally forward to Python FastAPI backend if configured
  if (BACKEND_URL) {
    fetch(`${BACKEND_URL}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: newReport.lat,
        lng: newReport.lng,
        reason: newReport.reason,
        address: typeof address === 'string' ? address.slice(0, 200) : '',
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, report: newReport })
}
