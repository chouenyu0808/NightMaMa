import { NextRequest, NextResponse } from 'next/server'
import { verifyInviteToken } from '@/lib/inviteToken'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rateLimit'

/**
 * GET /api/line/login?token=<邀請 token>
 *
 * 把緊急聯絡人導向 LINE 的授權頁。授權完成後 LINE 會帶著 code 回呼
 * /api/line/callback，我們才在那裡換取對方的 userId。
 *
 * 為什麼要由「聯絡人本人」登入：LINE Login 只會回傳登入者自己的 userId，
 * 沒有任何 API 能讓 A 查出 B 的 userId。所以綁定必然是對方親自授權。
 */

const AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize'

const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000

export async function GET(req: NextRequest) {
  const limit = rateLimit(`line-login:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec)

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID
  const baseUrl = process.env.APP_BASE_URL
  if (!channelId || !baseUrl) {
    console.error('[line-login] 缺少 LINE_LOGIN_CHANNEL_ID 或 APP_BASE_URL')
    return NextResponse.json({ error: 'LINE 綁定服務尚未設定' }, { status: 503 })
  }

  const token = req.nextUrl.searchParams.get('token') || ''
  // 先驗章再導向，避免把無效邀請丟到 LINE 繞一圈才失敗
  if (!verifyInviteToken(token)) {
    return NextResponse.redirect(new URL('/invite/invalid', baseUrl))
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: channelId,
    redirect_uri: `${baseUrl}/api/line/callback`,
    // token 同時當作 state 往返，回呼時才知道要綁給誰，也順帶擋 CSRF
    state: token,
    scope: 'profile openid',
    // 讓授權流程順便詢問是否加入官方帳號好友。
    // 這一步是必要的：Messaging API 只能推播給「已加官方帳號好友」的人，
    // 沒加好友的話拿到 userId 也推不出去。
    bot_prompt: 'aggressive',
  })

  return NextResponse.redirect(`${AUTHORIZE_URL}?${params.toString()}`)
}
