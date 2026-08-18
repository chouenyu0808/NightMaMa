import Link from 'next/link'
import { IconCheckCircle, IconAlertTriangle, IconBellOff, type IconProps } from '@/components/Icons'

export type Tone = 'success' | 'error' | 'warn'

const TONE_COLOR: Record<Tone, string> = {
  success: '#10b981',
  error: '#ef4444',
  warn: '#f59e0b',
}

const TONE_ICON: Record<Tone, (props: IconProps) => React.ReactElement> = {
  success: IconCheckCircle,
  error: IconAlertTriangle,
  warn: IconBellOff,
}

/** /invite/* 各結果頁共用的版面。 */
export default function InviteResult({
  tone,
  title,
  children,
}: {
  tone: Tone
  title: string
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
        padding: '30px 24px 28px', textAlign: 'center',
        border: `1px solid ${TONE_COLOR[tone]}55`,
      }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: TONE_COLOR[tone] }}>
          {TONE_ICON[tone]({ size: 40 })}
        </div>
        <h1 style={{ fontSize: 21, fontWeight: 900, margin: '0 0 14px', color: TONE_COLOR[tone] }}>
          {title}
        </h1>
        <div style={{ fontSize: 14, lineHeight: 1.8, color: 'rgba(255,255,255,0.75)' }}>
          {children}
        </div>
        <Link
          href="/"
          style={{
            display: 'block', marginTop: 24, textAlign: 'center',
            fontSize: 13, color: 'rgba(255,255,255,0.4)', textDecoration: 'none',
          }}
        >
          關於 NightMaMa
        </Link>
      </div>
    </div>
  )
}
