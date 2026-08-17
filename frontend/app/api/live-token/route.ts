import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rateLimit'

/**
 * POST /api/live-token — 換發 Gemini Live API 的短期 ephemeral token。
 *
 * 為什麼需要這支：Gemini Live 是瀏覽器直連的雙向 WebSocket，沒辦法用一般的
 * API route 代理。原本的作法是把 NEXT_PUBLIC_GEMINI_KEY 直接編進前端 bundle，
 * 等於把長期金鑰公開給所有訪客。
 *
 * 改成由伺服器持有長期金鑰、對外只發放「1 次使用 / 30 分鐘到期」的短期 token，
 * 就算被攔截，可造成的損害也有限。
 */

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60_000

// token 本身的有效期
const TOKEN_TTL_MS = 30 * 60 * 1000
// 必須在這段時間內開始建立 Live session
const NEW_SESSION_TTL_MS = 60 * 1000

export async function POST(req: NextRequest) {
  const limit = rateLimit(`live-token:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[live-token] 缺少 GEMINI_API_KEY 環境變數')
    return NextResponse.json(
      { error: '語音服務尚未設定', code: 'NOT_CONFIGURED' },
      { status: 503 }
    )
  }

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } })

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
        newSessionExpireTime: new Date(Date.now() + NEW_SESSION_TTL_MS).toISOString(),
      },
    })

    if (!token.name) {
      throw new Error('Gemini 未回傳 token name')
    }

    return NextResponse.json(
      { token: token.name },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    console.error('[live-token] 換發 ephemeral token 失敗', err)
    return NextResponse.json(
      { error: '無法取得語音連線授權', code: 'TOKEN_FAILED' },
      { status: 502 }
    )
  }
}
