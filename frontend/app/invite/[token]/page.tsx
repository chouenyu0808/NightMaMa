import { verifyInviteToken } from '@/lib/inviteToken'
import Link from 'next/link'

/**
 * 緊急聯絡人收到邀請連結後看到的頁面。
 *
 * 這是 Server Component：驗章必須在伺服器端做，簽章密鑰不能進瀏覽器。
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const invite = verifyInviteToken(decodeURIComponent(token))

  if (!invite) {
    return (
      <Shell title="邀請連結無效" tone="error">
        <p style={p}>
          這個邀請連結已過期或格式不正確。邀請連結的有效期為 24 小時，
          請向邀請你的人索取新的連結。
        </p>
      </Shell>
    )
  }

  return (
    <Shell title="成為緊急聯絡人" tone="normal">
      <p style={p}>
        有人希望在夜間獨自步行時，能把即時位置與求救訊息傳給你。
      </p>
      <p style={{ ...p, marginTop: 12 }}>
        按下方按鈕以 LINE 登入授權後，對方觸發 SOS 或抵達目的地時，
        你就會直接在 LINE 收到通知。
      </p>

      <a
        href={`/api/line/login?token=${encodeURIComponent(token)}`}
        style={{
          display: 'block', marginTop: 26, padding: '15px', borderRadius: 14,
          background: '#06C755', color: '#fff', fontSize: 16, fontWeight: 800,
          textAlign: 'center', textDecoration: 'none',
        }}
      >
        以 LINE 登入並成為緊急聯絡人
      </a>

      <p style={{ ...p, fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 18, lineHeight: 1.7 }}>
        授權過程中會詢問是否加入 NightMaMa 官方帳號好友，
        <b style={{ color: 'rgba(255,255,255,0.7)' }}>請務必同意</b> ——
        LINE 只允許推播給官方帳號的好友，沒有加入就收不到通知。
        <br /><br />
        NightMaMa 只會取得你的 LINE 顯示名稱與推播用 ID，不會讀取你的
        聊天記錄或好友清單。
      </p>
    </Shell>
  )
}

const p: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.8,
  color: 'rgba(255,255,255,0.8)',
  margin: 0,
}

function Shell({
  title,
  tone,
  children,
}: {
  title: string
  tone: 'normal' | 'error'
  children: React.ReactNode
}) {
  return (
    <div style={{
      minHeight: '100dvh', background: '#0b0e1b', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: '#111827', borderRadius: 22,
        padding: '30px 24px 28px',
        border: `1px solid ${tone === 'error' ? 'rgba(239,68,68,0.35)' : 'rgba(6,199,85,0.3)'}`,
      }}>
        <div style={{ fontSize: 30, marginBottom: 10 }}>{tone === 'error' ? '⚠️' : '🌙'}</div>
        <h1 style={{
          fontSize: 21, fontWeight: 900, margin: '0 0 14px',
          color: tone === 'error' ? '#f87171' : '#fff',
        }}>
          {title}
        </h1>
        {children}
        <Link
          href="/"
          style={{
            display: 'block', marginTop: 22, textAlign: 'center',
            fontSize: 13, color: 'rgba(255,255,255,0.4)', textDecoration: 'none',
          }}
        >
          關於 NightMaMa
        </Link>
      </div>
    </div>
  )
}
