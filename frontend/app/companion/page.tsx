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
  text: '嗨！我是 NightMaMa 🌙 我會一路陪你走回家。有任何問題或感到不安都可以跟我說！',
  timestamp: Date.now(),
}

function CompanionContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<AnySpeechRecognition | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingReplyRef = useRef<((text: string) => void) | null>(null)
  const userIdRef = useRef<string>('')
  if (!userIdRef.current) userIdRef.current = crypto.randomUUID()

  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

  // Route context from URL params (display only — chat now goes through the backend)
  const context: RouteContext = {
    origin: searchParams.get('origin') || '出發地',
    destination: searchParams.get('destination') || '目的地',
    safetyScore: parseInt(searchParams.get('safety') || '70'),
    durationMin: Math.round(parseInt(searchParams.get('duration') || '600') / 60),
  }

  // Connect to backend chat WebSocket
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
    const ws = new WebSocket(`${backendUrl.replace(/^http/, 'ws')}/stream/${userIdRef.current}`)
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      pendingReplyRef.current?.(data.type === 'urgent' ? data.message : data.text)
      pendingReplyRef.current = null
    }
    wsRef.current = ws
    return () => ws.close()
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // Text-to-Speech
  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'zh-TW'
    utt.rate = 1.05
    utt.pitch = 1.1
    utt.onstart = () => setIsSpeaking(true)
    utt.onend = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utt)
  }, [])

  // Auto-speak initial message
  useEffect(() => {
    const timer = setTimeout(() => speak(INITIAL_MESSAGE.text), 500)
    return () => clearTimeout(timer)
  }, [speak])

  const sendMsg = useCallback(async (text: string) => {
    if (!text.trim() || isThinking) return
    const userMsg: Message = { role: 'user', text: text.trim(), timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsThinking(true)

    try {
      const reply = await new Promise<string>((resolve, reject) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          reject(new Error('ws not open'))
          return
        }
        pendingReplyRef.current = resolve
        wsRef.current.send(JSON.stringify({ type: 'speech', text }))
      })
      const aiMsg: Message = { role: 'ai', text: reply, timestamp: Date.now() }
      setMessages(prev => [...prev, aiMsg])
      speak(reply)
    } catch {
      const errMsg: Message = { role: 'ai', text: '抱歉，連線有點問題，但我還在這裡陪你！', timestamp: Date.now() }
      setMessages(prev => [...prev, errMsg])
      speak(errMsg.text)
    } finally {
      setIsThinking(false)
    }
  }, [isThinking, speak])

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

  const safetyColor = context.safetyScore >= 65 ? '#10b981' : context.safetyScore >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="glass" style={{
        padding: '52px 20px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()} className="btn-icon" style={{ width: 36, height: 36, fontSize: 16 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>🎙️ AI 語音陪聊</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {context.origin} → {context.destination}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: safetyColor, fontWeight: 700, fontSize: 18 }}>{context.safetyScore}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>安全分</div>
          </div>
        </div>

        {/* Speaking indicator */}
        {isSpeaking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: '#8b5cf6', fontSize: 12 }}>
            <SoundWave />
            <span>NightMaMa 說話中…</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        className="scrollable"
        style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {msg.role === 'ai' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>🌙</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>NightMaMa</span>
              </div>
            )}
            <div className={`voice-bubble ${msg.role === 'ai' ? 'ai' : 'user'}`}>
              {msg.text}
            </div>
          </div>
        ))}

        {isThinking && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ fontSize: 16 }}>🌙</span>
            <div className="voice-bubble ai" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <ThinkingDots />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts */}
      <div style={{ padding: '8px 20px', display: 'flex', gap: 8, overflowX: 'auto' }} className="scrollable">
        {['附近有超商嗎？', '我有點害怕', '還要走多久？', '幫我撥打假電話'].map(prompt => (
          <button
            key={prompt}
            onClick={() => prompt === '幫我撥打假電話' ? router.push('/sos?fakeCall=1') : sendMsg(prompt)}
            style={{
              whiteSpace: 'nowrap',
              padding: '7px 14px',
              borderRadius: 999,
              border: '1px solid rgba(139,92,246,0.3)',
              background: 'rgba(139,92,246,0.1)',
              color: '#c4b5fd',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="glass" style={{
        padding: '12px 20px',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
      }}>
        <input
          className="input-field"
          style={{ flex: 1 }}
          placeholder="輸入訊息…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMsg(input)}
        />
        <button className="btn-icon" onClick={() => sendMsg(input)} style={{ background: 'rgba(139,92,246,0.3)' }}>➤</button>
        <button
          className={`mic-btn ${isListening ? 'recording' : ''}`}
          style={{ width: 52, height: 52 }}
          onClick={toggleListening}
        >
          {isListening ? '⏹' : '🎙️'}
        </button>
      </div>

      <NavBar active="companion" />
    </div>
  )
}

function SoundWave() {
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center', height: 16 }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: 3, background: '#8b5cf6', borderRadius: 2,
          animation: `soundWave 0.8s ease-in-out infinite`,
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
      <style>{`
        @keyframes soundWave {
          0%, 100% { height: 4px; }
          50% { height: 14px; }
        }
      `}</style>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'rgba(255,255,255,0.5)',
          animation: 'bounce 1.2s infinite',
          animationDelay: `${i * 0.2}s`,
        }} />
      ))}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export default function CompanionPage() {
  return (
    <Suspense fallback={<div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>載入中…</div>}>
      <CompanionContent />
    </Suspense>
  )
}
