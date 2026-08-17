import { NextRequest, NextResponse } from 'next/server'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rateLimit'

/**
 * POST /api/score — 代理到 Python 後端的 /score。
 *
 * 走代理而不是讓瀏覽器直連後端的理由：
 * 1. 後端網址可以是 server-only 環境變數，不必用 NEXT_PUBLIC_ 暴露拓撲，
 *    後端 Cloud Run 服務也就有機會設成不對外公開。
 * 2. 完全不需要處理 CORS。
 * 3. 每次評分都會產生 BigQuery job 與 Places 呼叫的實際費用，
 *    在這裡就能先做速率限制。
 */

const MAX_POLYLINES = 8
// 單條編碼 polyline 的合理長度上限，避免超大 payload 撐爆 BigQuery cross join
const MAX_POLYLINE_LENGTH = 20_000

const RATE_LIMIT_MAX = 12
const RATE_LIMIT_WINDOW_MS = 60_000

// 後端要跑兩個 BigQuery job 加上數十個 Places 呼叫，給足時間但不要無限等
const UPSTREAM_TIMEOUT_MS = 25_000

export async function POST(req: NextRequest) {
  const limit = rateLimit(`score:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec)

  const backendUrl = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '')
  if (!backendUrl) {
    return NextResponse.json(
      { error: '安全評分服務尚未設定（缺少 BACKEND_URL）', code: 'NOT_CONFIGURED' },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 })
  }

  const { polylines } = (body ?? {}) as { polylines?: unknown }

  if (!Array.isArray(polylines) || polylines.length === 0) {
    return NextResponse.json({ error: '缺少 polylines' }, { status: 400 })
  }
  if (polylines.length > MAX_POLYLINES) {
    return NextResponse.json({ error: `一次最多 ${MAX_POLYLINES} 條路線` }, { status: 400 })
  }
  if (!polylines.every(p => typeof p === 'string' && p.length > 0 && p.length <= MAX_POLYLINE_LENGTH)) {
    return NextResponse.json({ error: 'polyline 格式無效' }, { status: 400 })
  }

  try {
    const upstream = await fetch(`${backendUrl}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ polylines }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      console.error('[score] 後端回應異常', upstream.status, detail)
      return NextResponse.json(
        { error: `安全評分計算失敗 (HTTP ${upstream.status})`, code: 'UPSTREAM_ERROR' },
        { status: 502 }
      )
    }

    const data = await upstream.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[score] 無法連線至後端', err)
    return NextResponse.json(
      { error: '無法連線至安全評分服務', code: 'UPSTREAM_UNREACHABLE' },
      { status: 502 }
    )
  }
}
