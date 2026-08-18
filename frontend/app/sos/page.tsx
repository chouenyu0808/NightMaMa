'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { NavBar } from '@/app/components/NavBar'
import {
  IconPhoneOff, IconPhoneCall, IconBell, IconX, IconCheckCircle, IconPin,
  IconShield, IconAlertTriangle, IconAmbulance, IconUser,
} from '@/components/Icons'

import { primaryContact, refreshContactsFromBackend, sendLineNotification } from '@/lib/emergencyContacts'

function SOSContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isFakeCall = searchParams.get('fakeCall') === '1'


  const [sosSent, setSosSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [fakeCallActive, setFakeCallActive] = useState(isFakeCall)
  const [fakeCallState, setFakeCallState] = useState<'ringing' | 'connected'>(isFakeCall ? 'ringing' : 'ringing')
  const [callDuration, setCallDuration] = useState(0)
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationError, setLocationError] = useState<'denied' | 'unavailable' | 'timeout' | null>(null)
  const [notifyResult, setNotifyResult] = useState<{ sent: boolean; message: string } | null>(null)
  const [locationUnavailable, setLocationUnavailable] = useState(false)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)

  // 倒數用的 setInterval 會把當下的 sendSOSNotification 連同它讀到的 state
  // 一起封進閉包。定位若在倒數的 5 秒之間才回來，state 更新不會反映到那個
  // 閉包裡，訊息仍會寫「定位失敗」。改用 ref 讓送出當下永遠讀到最新座標。
  const locationRef = useRef<{ lat: number; lng: number } | null>(null)

  // Call duration counter when connected
  useEffect(() => {
    if (!fakeCallActive || fakeCallState !== 'connected') return
    const timer = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => clearInterval(timer)
  }, [fakeCallActive, fakeCallState])

  // 綁定是在聯絡人的裝置上完成的，結果只存在 Firestore。
  // 這裡先拉一次，否則本機 localStorage 是空的，按 SOS 會找不到人。
  useEffect(() => {
    refreshContactsFromBackend().catch(() => {})
  }, [])

  // 定位。
  //
  // 定位失敗時「不」填入台北車站之類的預設座標：求救訊息附上一個錯誤的位置，
  // 比明講「定位失敗」更危險，會把救援引導到錯的地方。
  //
  // 雙策略的理由：先前只用一次性的 getCurrentPosition 搭配
  // enableHighAccuracy + 10 秒逾時、且沒有 maximumAge，等於強制要一個
  // 全新的高精度定位。室內或高樓間常常拿不到，而 SOS 倒數只有 5 秒，
  // 時間到了座標還沒回來就送出「定位失敗」。
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      // 包一層 microtask，避開 effect body 內同步 setState 造成的串接渲染
      queueMicrotask(() => setLocationError('unavailable'))
      return
    }

    const accept = (pos: GeolocationPosition) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      locationRef.current = p
      setCurrentLocation(p)
      setLocationError(null)
    }

    const reject = (err: GeolocationPositionError) => {
      // 已經有座標了就不要因為後續一次失敗把它清掉
      if (locationRef.current) return
      if (err.code === err.PERMISSION_DENIED) setLocationError('denied')
      else if (err.code === err.TIMEOUT) setLocationError('timeout')
      else setLocationError('unavailable')
    }

    // 策略 1：低精度 + 允許 60 秒內的快取，通常瞬間就有值
    navigator.geolocation.getCurrentPosition(accept, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60000,
    })

    // 策略 2：持續監聽高精度定位，之後會用更準的座標覆蓋策略 1 的結果
    const watchId = navigator.geolocation.watchPosition(accept, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 10000,
    })

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  /** 送出前最後再等一下定位，避免倒數結束時剛好還差一點。 */
  const waitForLocation = async (maxWaitMs = 4000): Promise<{ lat: number; lng: number } | null> => {
    const deadline = Date.now() + maxWaitMs
    while (!locationRef.current && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 250))
    }
    return locationRef.current
  }

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
    const contact = primaryContact()
    const contactName = contact?.name || '使用者'

    // 從 ref 讀，不是 state —— 這個函式是被 setInterval 的閉包呼叫的
    const location = locationRef.current ?? (await waitForLocation())

    const hasRealLocation = location !== null
    const mapsUrl = location
      ? `https://maps.google.com/?q=${location.lat},${location.lng}`
      : ''

    const locationLine = hasRealLocation
      ? `📍 即時 GPS 定位：${mapsUrl}`
      : '📍 定位失敗，未取得即時 GPS 位置'

    const message = `🚨 【NightMaMa 緊急求救警報】\n您的聯絡人 (${contactName}) 在夜間步行時觸發了 SOS 緊急求救！\n\n${locationLine}\n⏰ 觸發時間：${new Date().toLocaleString('zh-TW')}\n\n請立即嘗試聯繫確認對方是否平安！`

    const outcome = await sendLineNotification(message, contact?.lineUserId)

    setSending(false)
    setSosSent(true)
    // 據實回報：發送失敗時必須讓使用者知道，才能改用電話等其他方式求救
    setNotifyResult(outcome)
    setLocationUnavailable(!hasRealLocation)

    // 聯絡人尚未完成 LINE 綁定時，改開 LINE 讓使用者手動選收件人送出
    if (!outcome.sent && outcome.shareUrl) {
      window.location.assign(outcome.shareUrl)
    }
  }

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  const triggerAudioPlay = () => {
    setAudioUnlocked(true)
    if (audioRef.current && fakeCallState === 'ringing') {
      audioRef.current.play().catch(console.warn)
    } else if (fakeCallState === 'ringing') {
      audioRef.current = new Audio('/line_ringtone.mp3')
      audioRef.current.loop = true
      audioRef.current.play().catch(console.warn)
    }
  }

  // Play authentic 320k LINE Ringtone MP3 continuously while ringing
  useEffect(() => {
    if (fakeCallActive && fakeCallState === 'ringing') {
      if (!audioRef.current) {
        audioRef.current = new Audio('/line_ringtone.mp3')
        audioRef.current.loop = true
      }
      audioRef.current.play().then(() => setAudioUnlocked(true)).catch(err => {
        console.warn('Browser autoplay notice:', err)
        setAudioUnlocked(false)
      })
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
  }, [fakeCallActive, fakeCallState])

  const voiceAudioRef = useRef<HTMLAudioElement | null>(null)

  // Handle Voice MP3 cleanup
  useEffect(() => {
    if (!fakeCallActive || fakeCallState !== 'connected') {
      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause()
        voiceAudioRef.current.currentTime = 0
      }
    }
    return () => {
      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause()
        voiceAudioRef.current.currentTime = 0
      }
    }
  }, [fakeCallActive, fakeCallState])

  const acceptCall = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (!voiceAudioRef.current) {
      voiceAudioRef.current = new Audio('/mom_voice.wav')
    }
    voiceAudioRef.current.currentTime = 0
    voiceAudioRef.current.play().catch(console.warn)
    setFakeCallState('connected')
  }

  const endCall = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause()
      voiceAudioRef.current.currentTime = 0
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setFakeCallActive(false)
  }

  if (fakeCallActive && fakeCallState === 'ringing') {
    return (
      <div
        onClick={triggerAudioPlay}
        style={{ height: '100dvh', background: '#111827', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '60px 24px 80px', color: 'white', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mom_avatar.jpg"
            alt="媽咪"
            style={{ width: 110, height: 110, borderRadius: '50%', objectFit: 'cover', border: '4px solid rgba(255,255,255,0.2)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
          />
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>媽咪</div>
          <div style={{ color: '#06C755', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconPhoneCall size={16} color="#06C755" /> LINE 語音來電…
          </div>
          {!audioUnlocked && (
            <div style={{ fontSize: 11, background: 'rgba(6,199,85,0.2)', color: '#06C755', padding: '4px 12px', borderRadius: 999, border: '1px solid rgba(6,199,85,0.3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconBell size={12} color="#06C755" /> 點擊螢幕解鎖鈴聲
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 60, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <button onClick={endCall} style={{ width: 72, height: 72, borderRadius: '50%', background: '#EF4444', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 16px rgba(239,68,68,0.5)' }}><IconPhoneOff size={32} color="white" /></button>
            <span style={{ fontSize: 12, opacity: 0.8 }}>拒絕</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <button onClick={acceptCall} style={{ width: 72, height: 72, borderRadius: '50%', background: '#06C755', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 16px rgba(6,199,85,0.5)' }}><IconPhoneCall size={32} color="white" /></button>
            <span style={{ fontSize: 12, opacity: 0.8 }}>接聽</span>
          </div>
        </div>
      </div>
    )
  }

  if (fakeCallActive && fakeCallState === 'connected') {
    const mins = String(Math.floor(callDuration / 60)).padStart(2, '0')
    const secs = String(callDuration % 60).padStart(2, '0')

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
          <div style={{ color: '#06C755', fontSize: 14, fontWeight: 600 }}>LINE 通話中 {mins}:{secs}</div>
          <div className="glass-light" style={{ color: '#F3F4F6', textAlign: 'center', fontSize: 15, marginTop: 14, padding: '14px 20px', borderRadius: 18, lineHeight: 1.6, maxWidth: 300, background: 'rgba(255,255,255,0.08)' }}>
            「喂～寶貝你走到哪裡啦？媽媽在客廳看電視等你喔！附近路燈有亮嗎？幫你留了熱湯，記得走大馬路快點回來喔！」
          </div>
        </div>

        <button
          onClick={() => {
            endCall()
            router.back()
          }}
          style={{ width: 72, height: 72, borderRadius: '50%', background: '#EF4444', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 16px rgba(239,68,68,0.5)' }}
        >
          <IconPhoneOff size={32} color="white" />
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{ padding: '52px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontWeight: 900, fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}><IconAlertTriangle size={20} color="#ef4444" /> 緊急協助</div>
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
        {/* 定位狀態：按下 SOS 之前就要看得到，不然求救訊息送出才發現沒有位置 */}
        {!sosSent && (
          <div style={{
            width: '100%', borderRadius: 12, padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, lineHeight: 1.5,
            background: currentLocation ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
            border: `1px solid ${currentLocation ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}`,
            color: currentLocation ? '#34d399' : '#fbbf24',
          }}>
            <IconPin size={14} color={currentLocation ? '#34d399' : '#fbbf24'} />
            <span style={{ fontWeight: 600 }}>
              {currentLocation
                ? `已取得定位 ${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}`
                : locationError === 'denied'
                  ? '位置權限被拒絕。求救訊息將無法附上你的位置 —— 請在瀏覽器網址列的鎖頭圖示開啟位置權限，再重新整理。'
                  : locationError === 'unavailable'
                    ? '此裝置或瀏覽器無法取得定位，求救訊息將不含位置。'
                    : '定位中… 請稍候，取得後才能附上你的位置'}
            </span>
          </div>
        )}

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
                  style={{ padding: '12px 32px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', fontSize: 15, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <IconX size={16} color="white" /> 取消
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 20, textAlign: 'center' }}>
            {notifyResult?.sent ? (
              <>
                <IconCheckCircle size={60} color="#10b981" />
                <div style={{ fontWeight: 700, fontSize: 18, color: '#10b981' }}>SOS 已發送！</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                  {locationUnavailable
                    ? '已通知緊急聯絡人，但定位失敗，訊息未附上你的位置'
                    : '已通知緊急聯絡人並附上你的位置'}
                </div>
              </>
            ) : (
              <>
                <IconAlertTriangle size={60} color="#ef4444" />
                <div style={{ fontWeight: 700, fontSize: 18, color: '#ef4444' }}>LINE 通知未送出</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 300, lineHeight: 1.6 }}>
                  {notifyResult?.message || '發送失敗。'}
                </div>
                <a
                  href="tel:110"
                  style={{
                    marginTop: 4, padding: '12px 28px', borderRadius: 999,
                    background: '#ef4444', color: 'white', fontWeight: 800,
                    fontSize: 15, textDecoration: 'none',
                  }}
                >
                  改撥 110 報警
                </a>
              </>
            )}
            {currentLocation && (
              <a
                href={`https://maps.google.com/?q=${currentLocation.lat},${currentLocation.lng}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#60a5fa', fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <IconPin size={14} color="#60a5fa" /> 查看目前位置
              </a>
            )}
          </div>
        )}

        {/* Fake call option */}
        <div className="glass" style={{ width: '100%', padding: 20, borderRadius: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><IconPhoneCall size={16} /> 假裝來電</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 14 }}>
            感到不適時，假裝正在通話可嚇阻潛在威脅
          </div>
          <button
            className="btn-primary"
            style={{ background: 'linear-gradient(135deg, #10b981, #047857)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={() => { setFakeCallActive(true); setFakeCallState('ringing'); setCallDuration(0); }}
          >
            <IconPhoneCall size={16} color="white" /> 開始假裝來電
          </button>
        </div>

        {/* Safety tips */}
        <div className="glass" style={{ width: '100%', padding: 20, borderRadius: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><IconShield size={18} /> 緊急求助資訊</div>
          {[
            { icon: <IconUser size={20} />, label: '警察局', number: '110' },
            { icon: <IconAmbulance size={20} />, label: '救護車', number: '119' },
            { icon: <IconPhoneCall size={20} />, label: '婦幼保護專線', number: '113' },
          ].map(item => (
            <a
              key={item.number}
              href={`tel:${item.number}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none', color: 'white' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {item.icon}
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
