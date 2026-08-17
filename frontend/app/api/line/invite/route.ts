import { NextRequest, NextResponse } from 'next/server'
import { createInviteToken } from '@/lib/inviteToken'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rateLimit'

/**
 * POST /api/line/invite — 產生一條邀請連結，供使用者傳給緊急聯絡人。
 *
 * 簽章在伺服器端進行（密鑰不能進瀏覽器），所以不能在前端自行組出 token。
 */

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000

// 匿名 user id 是 crypto.randomUUID() 產生的
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const limit = rateLimit(`line-invite:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec)

  const baseUrl = process.env.APP_BASE_URL
  if (!baseUrl || !process.env.INVITE_SIGNING_SECRET) {
    console.error('[line-invite] 缺少 APP_BASE_URL 或 INVITE_SIGNING_SECRET')
    return NextResponse.json({ error: 'LINE 綁定服務尚未設定' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 })
  }

  const { userId } = (body ?? {}) as { userId?: unknown }
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    return NextResponse.json({ error: 'userId 格式無效' }, { status: 400 })
  }

  const token = createInviteToken(userId)
  return NextResponse.json(
    { url: `${baseUrl}/invite/${encodeURIComponent(token)}` },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
