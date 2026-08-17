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
    const contactName = contacts[0]?.name || '使用者'
    const targetId = contacts[0]?.lineToken || ''

    const mapsUrl = currentLocation
      ? `https://maps.google.com/?q=${currentLocation.lat},${currentLocation.lng}`
      : 'https://maps.google.com/?q=25.0478,121.5170'

    const message = `🚨 【NightMaMa 緊急求救警報】\n您的聯絡人 (${contactName}) 在夜間步行時觸發了 SOS 緊急求救！\n\n📍 即時 GPS 定位：${mapsUrl}\n⏰ 觸發時間：${new Date().toLocaleString('zh-TW')}\n\n請立即嘗試聯繫確認對方是否平安！`

    try {
      await fetch('/api/line-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, message }),
      })
    } catch {
      // silent fail — still show sent state
    }
    setSending(false)
    setSosSent(true)
  }

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Play authentic LINE Ringtone MP3 when fake call ringing
  useEffect(() => {
    if (fakeCallActive && fakeCallTimer > 0) {
      if (!audioRef.current) {
        audioRef.current = new Audio('/line_ringtone.mp3')
        audioRef.current.loop = true
      }
      audioRef.current.play().catch(err => console.warn('Audio play notice:', err))
    } else {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
    }
  }, [fakeCallActive, fakeCallTimer])

  // Speak voice when fake call answered
  useEffect(() => {
    if (fakeCallActive && fakeCallTimer === 0) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
        const utt = new SpeechSynthesisUtterance('喂？孩子你走到哪裡啦？媽媽在門口等你喔，附近明亮嗎？快點回來喔！')
        utt.lang = 'zh-TW'
        utt.rate = 1.0
        utt.pitch = 1.05
        window.speechSynthesis.speak(utt)
      }
    }
  }, [fakeCallActive, fakeCallTimer])

  if (fakeCallActive && fakeCallTimer > 0) {
    return (
      <div style={{ height: '100dvh', background: '#111827', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '60px 24px 80px', color: 'white' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mom_avatar.jpg"
            alt="媽咪"
            style={{ width: 110, height: 110, borderRadius: '50%', objectFit: 'cover', border: '4px solid rgba(255,255,255,0.2)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
          />
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>媽咪</div>
          <div style={{ color: '#06C755', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            💬 LINE 語音來電 ({fakeCallTimer}s)
          </div>
        </div>

        <div style={{ display: 'flex', gap: 60, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setFakeCallActive(false)} style={{ width: 72, height: 72, borderRadius: '50%', background: '#EF4444', border: 'none', color: 'white', fontSize: 32, cursor: 'pointer', boxShadow: '0 4px 16px rgba(239,68,68,0.5)' }}>📵</button>
            <span style={{ fontSize: 12, opacity: 0.8 }}>拒絕</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setFakeCallTimer(0)} style={{ width: 72, height: 72, borderRadius: '50%', background: '#06C755', border: 'none', color: 'white', fontSize: 32, cursor: 'pointer', boxShadow: '0 4px 16px rgba(6,199,85,0.5)' }}>📞</button>
            <span style={{ fontSize: 12, opacity: 0.8 }}>接聽</span>
          </div>
        </div>
      </div>
    )
  }

  if (fakeCallActive && fakeCallTimer === 0) {
    return (
      <div style={{ height: '100dvh', background: '#111827', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '60px 24px 80px', color: 'white' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mom_avatar.jpg"
            alt="媽咪"
            style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '4px solid #06C755', boxShadow: '0 0 20px rgba(6,199,85,0.4)' }}
          />
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>媽咪</div>
          <div style={{ color: '#06C755', fontSize: 14, fontWeight: 600 }}>LINE 通話中 00:08</div>
          <div className="glass-light" style={{ color: '#F3F4F6', textAlign: 'center', fontSize: 15, marginTop: 14, padding: '14px 20px', borderRadius: 18, lineHeight: 1.6, maxWidth: 300, background: 'rgba(255,255,255,0.08)' }}>
            「喂？孩子你走到哪裡啦？媽媽在門口等你喔，附近明亮嗎？快點回來喔！」
          </div>
        </div>

        <button
          onClick={() => {
            if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
            setFakeCallActive(false)
            router.back()
          }}
          style={{ width: 72, height: 72, borderRadius: '50%', background: '#EF4444', border: 'none', color: 'white', fontSize: 32, cursor: 'pointer', boxShadow: '0 4px 16px rgba(239,68,68,0.5)' }}
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
