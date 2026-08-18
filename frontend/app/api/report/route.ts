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

  const { lat, lng, category, address, user_id: userId } = (body ?? {}) as {
    lat?: unknown
    lng?: unknown
    category?: unknown
    address?: unknown
    user_id?: unknown
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

  // 轉發到 Python 後端，那裡才會寫進 BigQuery 的 unsafe_reports ——
  // 也就是路線評分實際讀取的來源。
  //
  // 先前這裡沒有帶 session_id，而後端的 ReportRequest 把它列為必填，
  // 因此每一筆通報都被擋在 422，再被下面的 catch 靜默吞掉：
  // 通報看起來成功、地圖也有紅點，但完全沒有進到評分資料裡。
  //
  // session_id 只用來做 SHA-256 雜湊後的去識別化統計，後端不會存原值，
  // 所以直接沿用前端的匿名 user_id 即可。
  if (BACKEND_URL) {
    fetch(`${BACKEND_URL}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: typeof userId === 'string' && userId ? userId : 'anonymous',
        user_id: typeof userId === 'string' ? userId : null,
        lat: newReport.lat,
        lng: newReport.lng,
        reason: newReport.reason,
        category: newReport.reason,
        address: typeof address === 'string' ? address.slice(0, 200) : '',
      }),
    })
      .then(res => {
        // 不阻塞回應，但要留下痕跡 —— 這條路徑壞掉時整個社區通報評分就是死的
        if (!res.ok) console.error('[report] 後端拒絕通報', res.status)
      })
      .catch(err => console.error('[report] 轉發後端失敗', err))
  }

  return NextResponse.json({ success: true, report: newReport })
}
