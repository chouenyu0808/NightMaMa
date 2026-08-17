import { createHmac, timingSafeEqual, randomBytes } from 'crypto'

/**
 * 緊急聯絡人邀請 token（僅伺服器端使用，依賴 node:crypto）。
 *
 * 邀請連結必然會被轉傳出去，所以裡面帶的「邀請者 user id」不能是裸值：
 * 否則任何人只要猜到或看過別人的 id，就能把自己綁成對方的緊急聯絡人，
 * 之後所有 SOS 都會推播給他。
 *
 * 因此 token 內容經過 HMAC 簽章並帶有效期，伺服器端驗章通過才接受。
 * 同一個 token 也直接當作 OAuth 的 state 參數往返 LINE，順帶擋掉 CSRF。
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24 小時

interface InvitePayload {
  /** 邀請者的匿名 user id（要把聯絡人綁定到誰身上） */
  inviter: string
  /** 每次產生都不同，避免同一個邀請者的 token 完全相同 */
  nonce: string
  /** 到期時間（epoch ms） */
  exp: number
}

function secret(): string {
  const s = process.env.INVITE_SIGNING_SECRET
  if (!s) throw new Error('缺少 INVITE_SIGNING_SECRET 環境變數')
  return s
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function sign(body: string): string {
  return b64url(createHmac('sha256', secret()).update(body).digest())
}

export function createInviteToken(inviter: string, ttlMs = DEFAULT_TTL_MS): string {
  const payload: InvitePayload = {
    inviter,
    nonce: randomBytes(8).toString('hex'),
    exp: Date.now() + ttlMs,
  }
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  return `${body}.${sign(body)}`
}

/** 驗章並解出邀請者 id。任何一步不通過都回傳 null，呼叫端一律當成無效邀請。 */
export function verifyInviteToken(token: string): { inviter: string } | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts

  let expected: Buffer
  let actual: Buffer
  try {
    expected = fromB64url(sign(body))
    actual = fromB64url(signature)
  } catch {
    return null
  }
  // 長度不同時 timingSafeEqual 會直接丟例外，所以要先擋
  if (expected.length !== actual.length) return null
  if (!timingSafeEqual(expected, actual)) return null

  try {
    const payload: InvitePayload = JSON.parse(fromB64url(body).toString('utf8'))
    if (!payload.inviter || typeof payload.exp !== 'number') return null
    if (Date.now() > payload.exp) return null
    return { inviter: payload.inviter }
  } catch {
    return null
  }
}
