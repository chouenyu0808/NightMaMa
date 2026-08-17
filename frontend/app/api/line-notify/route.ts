import { NextRequest, NextResponse } from 'next/server'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rateLimit'

/**
 * POST /api/line-notify — 推播訊息給「使用者自己設定的」LINE 緊急聯絡人。
 *
 * 安全設計：
 * 1. Channel Access Token 只從伺服器環境變數讀取，永遠不接受用戶端傳入，
 *    也絕不寫死在原始碼裡。
 * 2. 不提供 broadcast。原本的 broadcast fallback 會把單一使用者的求救訊息
 *    發給官方帳號的「所有」好友，既是隱私問題也是濫發管道。
 * 3. 必須指定合法的 LINE User ID 當收件人。
 * 4. per-IP 速率限制，避免這支端點被當成免費簡訊閘道。
 *
 * 註：舊版的 LINE Notify (notify-api.line.me) 已於 2025-03-31 終止服務，
 * 原本的第三段 fallback 是打向已下線的端點，一併移除。
 */

// LINE User ID 格式：U + 32 個十六進位字元
const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/i

// LINE Messaging API 單則文字訊息上限為 5000 字
const MAX_MESSAGE_LENGTH = 2000

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000

export async function POST(req: NextRequest) {
  const limit = rateLimit(`line-notify:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: '無效的請求內容' }, { status: 400 })
  }

  const { targetId, message } = (body ?? {}) as { targetId?: unknown; message?: unknown }

  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ success: false, error: '缺少訊息內容' }, { status: 400 })
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { success: false, error: `訊息長度超過上限 ${MAX_MESSAGE_LENGTH} 字` },
      { status: 400 }
    )
  }

  const recipient = typeof targetId === 'string' ? targetId.trim() : ''
  if (!LINE_USER_ID_PATTERN.test(recipient)) {
    // 沒有設定聯絡人時，前端必須據實告知使用者「訊息沒有送出」，
    // 不可以顯示成功畫面。
    return NextResponse.json(
      {
        success: false,
        code: 'NO_RECIPIENT',
        error: '尚未設定有效的 LINE 緊急聯絡人，訊息未送出。請到「設定」頁新增聯絡人的 LINE User ID。',
      },
      { status: 400 }
    )
  }

  const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()
  if (!channelToken) {
    console.error('[line-notify] 缺少 LINE_CHANNEL_ACCESS_TOKEN 環境變數')
    return NextResponse.json(
      { success: false, code: 'NOT_CONFIGURED', error: 'LINE 通知服務尚未設定，訊息未送出' },
      { status: 503 }
    )
  }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelToken}`,
      },
      body: JSON.stringify({
        to: recipient,
        messages: [{ type: 'text', text: message }],
      }),
    })

    if (res.ok) {
      return NextResponse.json({ success: true, mode: 'MessagingAPI-Push' })
    }

    // 只記錄狀態碼，不要把 LINE 回傳內容原封不動吐給用戶端
    const detail = await res.text().catch(() => '')
    console.error('[line-notify] LINE push 失敗', res.status, detail)
    return NextResponse.json(
      { success: false, code: 'PUSH_FAILED', error: `LINE 訊息發送失敗 (HTTP ${res.status})` },
      { status: 502 }
    )
  } catch (err) {
    console.error('[line-notify] LINE push 連線錯誤', err)
    return NextResponse.json(
      { success: false, code: 'NETWORK_ERROR', error: '無法連線至 LINE 服務，訊息未送出' },
      { status: 502 }
    )
  }
}
