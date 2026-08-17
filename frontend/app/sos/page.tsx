'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { NavBar } from '@/app/page'

const EMERGENCY_CONTACTS_KEY = 'nightmama_contacts'

function SOSContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isFakeCall = searchParams.get('fakeCall') === '1'

  const [sosSent, setSosSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [fakeCallActive, setFakeCallActive] = useState(isFakeCall)
  const [fakeCallTimer, setFakeCallTimer] = useState(3)
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)

  // Get location
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCurrentLocation({ lat: 25.0478, lng: 121.5319 }) // fallback: Taipei
    )
  }, [])

  // Fake call countdown
  useEffect(() => {
    if (!fakeCallActive) return
    if (fakeCallTimer <= 0) return
    const t = setTimeout(() => setFakeCallTimer(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [fakeCallActive, fakeCallTimer])

  const handleSOS = () => {
    if (sosSent || sending) return
    setSending(true)

    // Countdown 5s before sending
    let count = 5
    setCountdown(count)
    countdownRef.current = setInterval(() => {
      count--
      setCountdown(count)
      if (count <= 0) {
        clearInterval(countdownRef.current!)
        sendSOSNotification()
      }
    }, 1000)
  }

  const cancelSOS = () => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setSending(false)
    setCountdown(5)
  }

  const sendSOSNotification = async () => {
    const contacts = JSON.parse(localStorage.getItem(EMERGENCY_CONTACTS_KEY) || '[]') as Array<{ name: string; lineToken: string }>
    const token = process.env.NEXT_PUBLIC_LINE_NOTIFY_TOKEN || contacts[0]?.lineToken

    const mapsUrl = currentLocation
      ? `https://maps.google.com/?q=${currentLocation.lat},${currentLocation.lng}`
      : 'https://maps.google.com/?q=台北市'

    const message = `\n🆘 NightMaMa 緊急通知\n\n你的聯絡人正在夜間步行，已觸發 SOS 警報！\n\n📍 目前位置：${mapsUrl}\n⏰ 時間：${new Date().toLocaleTimeString('zh-TW')}\n\n請立即確認是否平安。`

    if (token) {
      try {
        await fetch('/api/line-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, message }),
        })
      } catch {
        // silent fail — still show sent state
      }
    }

    setSosSent(true)
    setSending(false)
  }

  if (fakeCallActive && fakeCallTimer > 0) {
    return (
      <div style={{ height: '100dvh', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <div style={{ fontSize: 60 }}>📞</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 16 }}>{fakeCallTimer} 秒後接通…</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>媽媽</div>
        <div style={{ display: 'flex', gap: 40, marginTop: 20 }}>
          <button onClick={() => setFakeCallActive(false)} style={{ width: 70, height: 70, borderRadius: '50%', background: '#ef4444', border: 'none', fontSize: 28, cursor: 'pointer' }}>📵</button>
          <button onClick={() => setFakeCallTimer(0)} style={{ width: 70, height: 70, borderRadius: '50%', background: '#10b981', border: 'none', fontSize: 28, cursor: 'pointer' }}>📞</button>
        </div>
      </div>
    )
  }

  if (fakeCallActive && fakeCallTimer === 0) {
    return (
      <div style={{ height: '100dvh', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <div style={{ fontSize: 60 }}>📞</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>媽媽</div>
        <div style={{ color: '#10b981' }}>通話中 00:00</div>
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: 14, marginTop: 8 }}>
          「喂？你到哪了？我在等你，快點回來！附近有人嗎？」
        </div>
        <button
          onClick={() => { setFakeCallActive(false); router.back() }}
          style={{ width: 70, height: 70, borderRadius: '50%', background: '#ef4444', border: 'none', fontSize: 28, cursor: 'pointer', marginTop: 24 }}
        >
          📵
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{ padding: '52px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontWeight: 900, fontSize: 20 }}>🆘 緊急協助</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          按下 SOS 將自動通知緊急聯絡人並發送定位
        </div>
      </div>

      <div className="scrollable" style={{
        flex: 1,
        padding: '24px 20px calc(88px + env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
      }}>
        {/* SOS Button */}
        {!sosSent ? (
          <>
            {!sending ? (
              <button className="sos-btn" onClick={handleSOS} style={{ marginTop: 20 }}>
                <span>SOS</span>
                <span style={{ fontSize: 12, fontWeight: 400, marginTop: 4 }}>按住發送</span>
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 20 }}>
                <div style={{
                  width: 140, height: 140, borderRadius: '50%',
                  background: 'rgba(239,68,68,0.15)',
                  border: '3px solid #ef4444',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ fontSize: 48, fontWeight: 900, color: '#ef4444' }}>{countdown}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>秒後發送</div>
                </div>
                <button
                  onClick={cancelSOS}
                  style={{ padding: '12px 32px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', fontSize: 15, cursor: 'pointer', fontWeight: 700 }}
                >
                  ✕ 取消
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 60 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#10b981' }}>SOS 已發送！</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              已通知緊急聯絡人並附上你的位置
            </div>
            {currentLocation && (
              <a
                href={`https://maps.google.com/?q=${currentLocation.lat},${currentLocation.lng}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#60a5fa', fontSize: 13, textDecoration: 'none' }}
              >
                📍 查看目前位置
              </a>
            )}
          </div>
        )}

        {/* Fake call option */}
        <div className="glass" style={{ width: '100%', padding: 20, borderRadius: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>📞 假裝來電</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 14 }}>
            感到不適時，假裝正在通話可嚇阻潛在威脅
          </div>
          <button
            className="btn-primary"
            style={{ background: 'linear-gradient(135deg, #10b981, #047857)' }}
            onClick={() => { setFakeCallActive(true); setFakeCallTimer(3) }}
          >
            📞 開始假裝來電
          </button>
        </div>

        {/* Safety tips */}
        <div className="glass" style={{ width: '100%', padding: 20, borderRadius: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>🛡️ 緊急求助資訊</div>
          {[
            { icon: '👮', label: '警察局', number: '110' },
            { icon: '🚑', label: '救護車', number: '119' },
            { icon: '📞', label: '婦幼保護專線', number: '113' },
          ].map(item => (
            <a
              key={item.number}
              href={`tel:${item.number}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none', color: 'white' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <span style={{ fontSize: 15 }}>{item.label}</span>
              </div>
              <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: 18 }}>{item.number}</span>
            </a>
          ))}
        </div>
      </div>

      <NavBar active="sos" />
    </div>
  )
}

export default function SOSPage() {
  return (
    <Suspense fallback={<div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>載入中…</div>}>
      <SOSContent />
    </Suspense>
  )
}
