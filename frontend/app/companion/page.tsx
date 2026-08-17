'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { NavBar } from '@/app/page'

interface RouteContext {
  origin: string
  destination: string
  safetyScore: number
  durationMin: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognitionEvent = any

interface Message {
  role: 'user' | 'ai'
  text: string
  timestamp: number
}

const INITIAL_MESSAGE: Message = {
  role: 'ai',
  text: '嗨！我是媽咪 🌙 我會一路陪你走回家。有任何問題或感到不安都可以跟我說喔！',
  timestamp: Date.now(),
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// Clean Vector SVG Icons
function IconChevronLeft() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
}
function IconSearch() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
}
function IconPhoneCall() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
}
function IconCalendar() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
}
function IconMenu() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
}
function IconPlus() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
}
function IconCamera() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
}
function IconSmile() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
}
function IconMic() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
}
function IconStore() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
}
function IconShield() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
}
function IconClock() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
}

function CompanionContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<AnySpeechRecognition | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingReplyRef = useRef<((data: { text: string; audio?: string }) => void) | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const userIdRef = useRef<string>('')
  if (!userIdRef.current) userIdRef.current = crypto.randomUUID()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [showQuickPrompts, setShowQuickPrompts] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Route context from URL params (display only — chat now goes through the backend)
  const context: RouteContext = {
    origin: searchParams.get('origin') || '我的位置',
    destination: searchParams.get('destination') || '目的地',
    safetyScore: parseInt(searchParams.get('safety') || '85'),
    durationMin: Math.round(parseInt(searchParams.get('duration') || '600') / 60),
  }

  // Connect to backend chat WebSocket
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
    const ws = new WebSocket(`${backendUrl.replace(/^http/, 'ws')}/stream/${userIdRef.current}`)
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      const text = data.type === 'urgent' ? data.message : data.text
      pendingReplyRef.current?.({ text, audio: data.audio })
      pendingReplyRef.current = null
    }
    wsRef.current = ws
    return () => ws.close()
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // Text-to-Speech — plays natural Gemini-generated voice audio (base64 WAV)
  // sent by the backend, instead of the browser's robotic speechSynthesis.
  const playAudio = useCallback((base64Wav: string) => {
    audioRef.current?.pause()
    const audio = new Audio(`data:audio/wav;base64,${base64Wav}`)
    audioRef.current = audio
    audio.onplay = () => setIsSpeaking(true)
    audio.onended = () => setIsSpeaking(false)
    audio.onerror = () => setIsSpeaking(false)
    audio.play().catch(() => setIsSpeaking(false))
  }, [])

  // Fetch + play speech for text that didn't come through the /stream reply
  // (e.g. the hardcoded initial greeting, or a fallback error message).
  const speak = useCallback(async (text: string, urgent = false) => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const res = await fetch(`${backendUrl}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, urgent }),
      })
      if (!res.ok) return
      const { audio } = await res.json()
      playAudio(audio)
    } catch {
      // TTS is a nice-to-have; silently skip playback on failure so chat still works
    }
  }, [playAudio])

  // Auto-speak initial message
  useEffect(() => {
    const timer = setTimeout(() => {
      speak(INITIAL_MESSAGE.text)
    }, 600)
    return () => clearTimeout(timer)
  }, [speak])

  const sendMsg = useCallback(async (text: string) => {
    if (!text.trim() || isThinking) return
    const userMsg: Message = { role: 'user', text: text.trim(), timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsThinking(true)

    try {
      const { text: reply, audio } = await new Promise<{ text: string; audio?: string }>((resolve, reject) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          reject(new Error('ws not open'))
          return
        }
        pendingReplyRef.current = resolve
        wsRef.current.send(JSON.stringify({ type: 'speech', text }))
      })
      const aiMsg: Message = { role: 'ai', text: reply, timestamp: Date.now() }
      setMessages(prev => [...prev, aiMsg])
      // Backend already synthesized audio for this reply — play it directly
      // instead of re-fetching from /speak.
      if (audio) playAudio(audio)
      else speak(reply)
    } catch {
      const errMsg: Message = { role: 'ai', text: '抱歉，連線有點問題，但我還在這裡陪你！', timestamp: Date.now() }
      setMessages(prev => [...prev, errMsg])
      speak(errMsg.text)
    } finally {
      setIsThinking(false)
    }
  }, [isThinking, speak, playAudio])

  // Photo upload risk analysis — sent through the /api/companion Next.js
  // route, which calls Gemini's multimodal endpoint directly (the FastAPI
  // backend doesn't expose an image-analysis endpoint yet).
  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      const userMsg: Message = {
        role: 'user',
        text: '📸 [已上傳路口照片，進行多模態風險分析]',
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, userMsg])
      setIsThinking(true)

      const history = messages.map(m => ({ role: m.role === 'ai' ? 'model' as const : 'user' as const, text: m.text }))

      try {
        const res = await fetch('/api/companion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userMessage: '請實時分析照片中前方暗巷與路口的照明風險，並給予避險繞路建議',
            history,
            context,
            imageData: base64,
          }),
        })
        const data = await res.json()
        const reply: string = data.reply || '照片解析失敗，但前方路口較暗，建議繞至明亮大馬路！'
        const aiMsg: Message = { role: 'ai', text: reply, timestamp: Date.now() }
        setMessages(prev => [...prev, aiMsg])
        speak(reply)
      } catch {
        const errMsg: Message = { role: 'ai', text: '照片解析失敗，但前方路口較暗，建議繞至明亮大馬路！', timestamp: Date.now() }
        setMessages(prev => [...prev, errMsg])
        speak(errMsg.text)
      } finally {
        setIsThinking(false)
      }
    }
    reader.readAsDataURL(file)
  }, [messages, context, speak])

  // Speech recognition
  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: AnySpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (!SR) {
      alert('你的瀏覽器不支援語音輸入，請用文字輸入')
      return
    }

    const recognition: AnySpeechRecognition = new SR()
    recognition.lang = 'zh-TW'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (e: AnySpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript
      sendMsg(transcript)
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening, sendMsg])

  // Voice call states
  const [callActive, setCallActive] = useState(false)
  const [callState, setCallState] = useState<'ringing' | 'connected'>('ringing')
  const [callDuration, setCallDuration] = useState(0)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null)
  const momVoiceAudioRef = useRef<HTMLAudioElement | null>(null)

  // Call duration counter when connected
  useEffect(() => {
    if (!callActive || callState !== 'connected') return
    const timer = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => clearInterval(timer)
  }, [callActive, callState])

  const triggerAudioPlay = () => {
    setAudioUnlocked(true)
    if (ringtoneAudioRef.current && callState === 'ringing') {
      ringtoneAudioRef.current.play().catch(console.warn)
    } else if (callState === 'ringing') {
      ringtoneAudioRef.current = new Audio('/line_ringtone.mp3')
      ringtoneAudioRef.current.loop = true
      ringtoneAudioRef.current.play().catch(console.warn)
    }
  }

  // Play authentic 320k LINE ringtone MP3 while ringing
  useEffect(() => {
    if (callActive && callState === 'ringing') {
      if (!ringtoneAudioRef.current) {
        ringtoneAudioRef.current = new Audio('/line_ringtone.mp3')
        ringtoneAudioRef.current.loop = true
      }
      ringtoneAudioRef.current.play().then(() => setAudioUnlocked(true)).catch(err => {
        console.warn('Browser autoplay notice:', err)
        setAudioUnlocked(false)
      })
    } else {
      if (ringtoneAudioRef.current) {
        ringtoneAudioRef.current.pause()
        ringtoneAudioRef.current.currentTime = 0
      }
    }
    return () => {
      if (ringtoneAudioRef.current) {
        ringtoneAudioRef.current.pause()
        ringtoneAudioRef.current.currentTime = 0
      }
    }
  }, [callActive, callState])

  // Handle Mom Voice MP3 cleanup
  useEffect(() => {
    if (!callActive || callState !== 'connected') {
      if (momVoiceAudioRef.current) {
        momVoiceAudioRef.current.pause()
        momVoiceAudioRef.current.currentTime = 0
      }
    }
    return () => {
      if (momVoiceAudioRef.current) {
        momVoiceAudioRef.current.pause()
        momVoiceAudioRef.current.currentTime = 0
      }
    }
  }, [callActive, callState])

  const startVoiceCall = useCallback(() => {
    setCallState('ringing')
    setCallDuration(0)
    setCallActive(true)
  }, [])

  const acceptVoiceCall = () => {
    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.pause()
      ringtoneAudioRef.current.currentTime = 0
    }
    // Play MP3 voice directly inside user click handler to satisfy browser autoplay policy
    if (!momVoiceAudioRef.current) {
      momVoiceAudioRef.current = new Audio('/api/tts')
    }
    momVoiceAudioRef.current.currentTime = 0
    momVoiceAudioRef.current.play().catch(console.warn)
    setCallState('connected')
  }

  const endVoiceCall = () => {
    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.pause()
      ringtoneAudioRef.current.currentTime = 0
    }
    if (momVoiceAudioRef.current) {
      momVoiceAudioRef.current.pause()
      momVoiceAudioRef.current.currentTime = 0
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setCallActive(false)

    // Append LINE-style Voice Call Ended card in chat history
    setMessages(prev => [
      ...prev,
      {
        role: 'ai',
        text: '📞 LINE 語音通話已結束。',
        timestamp: Date.now(),
      },
    ])
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      background: 'linear-gradient(180deg, #7b9ebf 0%, #6b8fb2 40%, #5d82a6 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    }}>

      {/* LINE Style Header */}
      <div style={{
        padding: '50px 16px 12px',
        background: '#7599bd',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: '#FFFFFF',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        zIndex: 50,
      }}>
        {/* Left: Back & Avatar Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <IconChevronLeft />
          </button>
          <div style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/mom_avatar.jpg"
              alt="媽咪"
              style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}
            />
            <div style={{
              position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: '50%',
              background: '#10B981', border: '2px solid #7599bd'
            }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              媽咪
            </div>
            <div style={{ fontSize: 11, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isSpeaking ? '#F59E0B' : '#10B981' }} />
              {isSpeaking ? '語音播報中…' : '在線陪伴中'}
            </div>
          </div>
        </div>

        {/* Right Action Icons (LINE Style - Matches user screenshot) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="搜尋"><IconSearch /></button>
          <button
            style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            onClick={startVoiceCall}
            title="語音通話"
          >
            <IconPhoneCall />
          </button>
          <button style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="行事曆"><IconCalendar /></button>
          <button style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="選單"><IconMenu /></button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        className="scrollable"
        style={{
          flex: 1,
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Date Divider Pill */}
        <div style={{ textAlign: 'center', margin: '4px 0 8px' }}>
          <span
            suppressHydrationWarning
            style={{
              background: 'rgba(0,0,0,0.22)',
              color: '#FFFFFF',
              borderRadius: 14,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.03em',
            }}
          >
            今天 {isMounted ? formatTime(messages[0]?.timestamp || Date.now()) : ''}
          </span>
        </div>

        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                gap: 8,
              }}
            >
              {/* AI Avatar */}
              {!isUser && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src="/mom_avatar.jpg"
                  alt="媽咪"
                  style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginTop: 2 }}
                />
              )}

              {/* User Side Timestamp & Read status */}
              {isUser && (
                <div style={{ textAlign: 'right', alignSelf: 'flex-end', paddingBottom: 2, flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>已讀</div>
                  <div suppressHydrationWarning style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{isMounted ? formatTime(msg.timestamp) : ''}</div>
                </div>
              )}

              {/* Chat Bubble */}
              <div
                style={{
                  maxWidth: '72%',
                  padding: '10px 14px',
                  borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: isUser ? '#86E260' : '#FFFFFF',
                  color: '#000000',
                  fontSize: 14,
                  lineHeight: 1.45,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                  wordBreak: 'break-word',
                  fontWeight: 400,
                }}
              >
                {msg.text}
              </div>

              {/* AI Side Timestamp */}
              {!isUser && (
                <div style={{ alignSelf: 'flex-end', paddingBottom: 2, flexShrink: 0 }}>
                  <div suppressHydrationWarning style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{isMounted ? formatTime(msg.timestamp) : ''}</div>
                </div>
              )}
            </div>
          )
        })}

        {/* AI Typing Indicator */}
        {isThinking && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/mom_avatar.jpg"
              alt="媽咪"
              style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
            <div style={{
              background: '#FFFFFF',
              borderRadius: '18px 18px 18px 4px',
              padding: '10px 16px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
            }}>
              <ThinkingDots />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Chips Bar */}
      {showQuickPrompts && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(0,0,0,0.15)',
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          backdropFilter: 'blur(6px)',
        }} className="scrollable">
          {[
            { id: 'store', label: '附近有超商嗎？', icon: <IconStore /> },
            { id: 'fear', label: '我有點害怕', icon: <IconShield /> },
            { id: 'time', label: '還要走多久？', icon: <IconClock /> },
            { id: 'call', label: '語音通話', icon: <IconPhoneCall /> },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => p.id === 'call' ? startVoiceCall() : sendMsg(p.label)}
              style={{
                whiteSpace: 'nowrap',
                padding: '6px 12px',
                borderRadius: 16,
                border: 'none',
                background: 'rgba(255,255,255,0.92)',
                color: '#1F2937',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {p.icon}
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* LINE Style Bottom Input Toolbar */}
      <div style={{
        padding: '8px 12px',
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        background: '#FFFFFF',
        borderTop: '1px solid #E5E7EB',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
      }}>
        {/* Left Action Buttons */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handlePhotoUpload}
        />
        <button style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }} title="更多">
          <IconPlus />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
          title="拍攝/上傳路口照片進行風險分析"
        >
          <IconCamera />
        </button>

        {/* Input Capsule Field */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          background: '#F3F4F6',
          borderRadius: 20,
          padding: '6px 14px',
        }}>
          <input
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: 15,
              color: '#111827',
            }}
            placeholder="輸入訊息…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMsg(input)}
          />
          {input.trim() ? (
            <button
              onClick={() => sendMsg(input)}
              style={{
                background: '#86E260',
                border: 'none',
                color: '#000000',
                fontWeight: 700,
                borderRadius: 14,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              傳送
            </button>
          ) : (
            <button style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <IconSmile />
            </button>
          )}
        </div>

        {/* Microphone Voice Button */}
        <button
          onClick={toggleListening}
          style={{
            background: isListening ? '#EF4444' : '#F3F4F6',
            color: isListening ? '#FFFFFF' : '#4B5563',
            border: 'none',
            borderRadius: '50%',
            width: 38,
            height: 38,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: isListening ? '0 0 10px rgba(239,68,68,0.5)' : 'none',
            transition: 'all 0.2s ease',
          }}
          title={isListening ? '停止錄音' : '語音輸入'}
        >
          <IconMic />
        </button>
      </div>

      {/* Full-screen LINE Voice Call Overlay */}
      {callActive && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: '#111827', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'space-between', padding: '60px 24px 80px', color: 'white'
        }} onClick={triggerAudioPlay}>
          {callState === 'ringing' ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/mom_avatar.jpg"
                  alt="媽咪"
                  style={{ width: 110, height: 110, borderRadius: '50%', objectFit: 'cover', border: '4px solid rgba(255,255,255,0.2)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                />
                <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>媽咪</div>
                <div style={{ color: '#06C755', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  💬 LINE 語音來電…
                </div>
                {!audioUnlocked && (
                  <div style={{ fontSize: 11, background: 'rgba(6,199,85,0.2)', color: '#06C755', padding: '4px 12px', borderRadius: 999, border: '1px solid rgba(6,199,85,0.3)', marginTop: 4 }}>
                    🔔 點擊螢幕解鎖鈴聲
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 60, alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <button onClick={endVoiceCall} style={{ width: 72, height: 72, borderRadius: '50%', background: '#EF4444', border: 'none', color: 'white', fontSize: 32, cursor: 'pointer', boxShadow: '0 4px 16px rgba(239,68,68,0.5)' }}>📵</button>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>拒絕</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <button onClick={acceptVoiceCall} style={{ width: 72, height: 72, borderRadius: '50%', background: '#06C755', border: 'none', color: 'white', fontSize: 32, cursor: 'pointer', boxShadow: '0 4px 16px rgba(6,199,85,0.5)' }}>📞</button>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>接聽</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/mom_avatar.jpg"
                  alt="媽咪"
                  style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '4px solid #06C755', boxShadow: '0 0 20px rgba(6,199,85,0.4)' }}
                />
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>媽咪</div>
                <div style={{ color: '#06C755', fontSize: 14, fontWeight: 600 }}>
                  LINE 通話中 {String(Math.floor(callDuration / 60)).padStart(2, '0')}:{String(callDuration % 60).padStart(2, '0')}
                </div>
                <div className="glass-light" style={{ color: '#F3F4F6', textAlign: 'center', fontSize: 15, marginTop: 14, padding: '14px 20px', borderRadius: 18, lineHeight: 1.6, maxWidth: 300, background: 'rgba(255,255,255,0.08)' }}>
                  「喂～寶貝你走到哪裡啦？媽媽在客廳看電視等你喔！附近路燈有亮嗎？幫你留了熱湯，記得走大馬路快點回來喔！」
                </div>
              </div>

              <button
                onClick={endVoiceCall}
                style={{ width: 72, height: 72, borderRadius: '50%', background: '#EF4444', border: 'none', color: 'white', fontSize: 32, cursor: 'pointer', boxShadow: '0 4px 16px rgba(239,68,68,0.5)' }}
              >
                📵
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: '#9CA3AF',
          animation: 'pulse 1.2s infinite ease-in-out',
          animationDelay: `${i * 0.2}s`
        }} />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}

export default function CompanionPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#7b9ebf', color: 'white' }}>
        載入陪伴模式中…
      </div>
    }>
      <CompanionContent />
    </Suspense>
  )
}
