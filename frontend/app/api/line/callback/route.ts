import { NextRequest, NextResponse } from 'next/server'
import { verifyInviteToken } from '@/lib/inviteToken'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rateLimit'

/**
 * GET /api/line/callback — LINE Login 授權完成後的回呼。
 *
 * 流程：code → access token → 取得登入者 profile（userId / displayName）
 *      → 呼叫後端把這個人綁成邀請者的緊急聯絡人。
 *
 * Channel Secret 只在這裡使用，且只在伺服器端；絕不能出現在任何
 * NEXT_PUBLIC_ 變數或前端程式碼中。
 */

const TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token'
const PROFILE_URL = 'https://api.line.me/v2/profile'

const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000

function redirectTo(baseUrl: string, path: string) {
  return NextResponse.redirect(new URL(path, baseUrl))
}

export async function GET(req: NextRequest) {
  const limit = rateLimit(`line-callback:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec)

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET
  const baseUrl = process.env.APP_BASE_URL
  const backendUrl = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '')

  if (!channelId || !channelSecret || !baseUrl) {
    console.error('[line-callback] 缺少 LINE Login 環境變數')
    return NextResponse.json({ error: 'LINE 綁定服務尚未設定' }, { status: 503 })
  }

  const params = req.nextUrl.searchParams
  const error = params.get('error')
  if (error) {
    // 使用者按了拒絕，不是系統錯誤
    console.warn('[line-callback] 使用者取消授權:', error)
    return redirectTo(baseUrl, '/invite/cancelled')
  }

  const code = params.get('code')
  const state = params.get('state') || ''
  if (!code) return redirectTo(baseUrl, '/invite/invalid')

  // state 就是簽章過的邀請 token；驗不過代表被竄改或已過期
  const invite = verifyInviteToken(state)
  if (!invite) return redirectTo(baseUrl, '/invite/invalid')

  try {
    // 1. code → access token
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${baseUrl}/api/line/callback`,
        client_id: channelId,
        client_secret: channelSecret,
      }).toString(),
    })

    if (!tokenRes.ok) {
      console.error('[line-callback] 換取 token 失敗', tokenRes.status, await tokenRes.text().catch(() => ''))
      return redirectTo(baseUrl, '/invite/failed')
    }
    const { access_token: accessToken } = await tokenRes.json()

    // 2. 取得登入者的 userId 與顯示名稱
    const profileRes = await fetch(PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!profileRes.ok) {
      console.error('[line-callback] 取得 profile 失敗', profileRes.status)
      return redirectTo(baseUrl, '/invite/failed')
    }
    const profile = await profileRes.json()
    const lineUserId: string = profile.userId || ''
    const displayName: string = profile.displayName || 'LINE 好友'

    if (!lineUserId) return redirectTo(baseUrl, '/invite/failed')

    // 3. 寫入後端：綁成邀請者的緊急聯絡人
    if (!backendUrl) {
      console.error('[line-callback] 缺少 BACKEND_URL，無法儲存綁定結果')
      return redirectTo(baseUrl, '/invite/failed')
    }

    const bindRes = await fetch(`${backendUrl}/users/${encodeURIComponent(invite.inviter)}/contacts/bind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: displayName, line_user_id: lineUserId }),
    })
    if (!bindRes.ok) {
      console.error('[line-callback] 後端儲存綁定失敗', bindRes.status)
      return redirectTo(baseUrl, '/invite/failed')
    }

    return redirectTo(baseUrl, `/invite/done?name=${encodeURIComponent(displayName)}`)
  } catch (err) {
    console.error('[line-callback] 未預期錯誤', err)
    return redirectTo(baseUrl, '/invite/failed')
  }
}
