/**
 * 極簡的固定視窗 per-IP 速率限制。
 *
 * 注意：狀態存在單一 process 的記憶體裡。Cloud Run 多實例時，每個實例各有一份
 * 計數，實際允許量會是 limit × 實例數；重新部署也會歸零。這只是擋掉最基本的
 * 濫用，正式環境應換成 Redis / Memorystore 之類的共用儲存。
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// 避免長時間執行時 Map 無限成長
const MAX_TRACKED_KEYS = 10_000

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/** 從反向代理標頭推出用戶端 IP。取不到就退回共用 key（整體限流）。 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export interface RateLimitResult {
  ok: boolean
  retryAfterSec: number
}

/**
 * @param key    識別字串，通常是 `${路由名稱}:${IP}`
 * @param limit  單一視窗內允許的請求數
 * @param windowMs 視窗長度（毫秒）
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  if (buckets.size > MAX_TRACKED_KEYS) sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }

  existing.count += 1
  if (existing.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) }
  }
  return { ok: true, retryAfterSec: 0 }
}

/** 命中限制時要回傳的標準 429 回應。 */
export function tooManyRequests(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: '請求過於頻繁，請稍後再試' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    }
  )
}
