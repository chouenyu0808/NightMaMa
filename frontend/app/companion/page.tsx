'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { sendMessage, type CompanionContext } from '@/lib/gemini'
import Logo from '@/components/Logo'

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
  text: '嗨！我是 NightMaMa 🌙 我會一路陪你走回家。有任何問題或感到不安都可以跟我說喔！',
  timestamp: Date.now(),
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function CompanionContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<AnySpeechRecognition | null>(null)

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

  // Route context from URL params
  const context: CompanionContext = {
    origin: searchParams.get('origin') || '我的位置',
    destination: searchParams.get('destination') || '目的地',
    safetyScore: parseInt(searchParams.get('safety') || '85'),
    durationMin: Math.round(parseInt(searchParams.get('duration') || '600') / 60),
    nearbyPlaces: ['全家便利商店', '7-ELEVEN'],
  }

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

function stripEmojis(str: string): string {
  return str
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

  // Text-to-Speech with warm female voice selection
  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()

    const cleanText = stripEmojis(text)
    if (!cleanText) return

    const utt = new SpeechSynthesisUtterance(cleanText)
    utt.lang = 'zh-TW'
    utt.rate = 1.0
    utt.pitch = 1.05

    const doSpeak = () => {
      const voices = window.speechSynthesis.getVoices()

      // Prioritize natural / neural / online high quality Taiwan Chinese female voices
      const warmVoice =
        voices.find(v => (v.lang.includes('zh-TW') || v.lang.includes('zh_TW') || v.lang.includes('TW')) && (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Neural') || v.name.includes('Enhanced') || v.name.includes('Premium'))) ||
        voices.find(v => (v.lang.includes('zh') || v.lang.includes('TW')) && (v.name.includes('Yating') || v.name.includes('HsiaoChen') || v.name.includes('HanHan') || v.name.includes('MeiJia') || v.name.includes('SinJi') || v.name.includes('Google 國語') || v.name.includes('臺灣'))) ||
        voices.find(v => v.lang.includes('zh-TW') || v.lang.includes('zh_TW')) ||
        voices.find(v => v.lang.startsWith('zh'))

      if (warmVoice) utt.voice = warmVoice

      utt.onstart = () => setIsSpeaking(true)
      utt.onend = () => setIsSpeaking(false)
      utt.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utt)
    }

    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      doSpeak()
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null
        doSpeak()
      }
    }
  }, [])

  // Auto-speak initial message once voices are loaded
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

    const history = messages.map(m => ({ role: m.role === 'ai' ? 'model' as const : 'user' as const, text: m.text }))

    try {
      const reply = await sendMessage(text, history, context)
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
  }, [messages, context, isThinking, speak])

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
            style={{ background: 'none', border: 'none', color: '#FFFFFF', fontSize: 24, cursor: 'pointer', padding: '0 4px' }}
          >
            ‹
          </button>
          <div style={{ position: 'relative' }}>
            <Logo size={40} style={{ borderRadius: '50%', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }} />
            <div style={{
              position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: '50%',
              background: '#10B981', border: '2px solid #7599bd'
            }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              NightMaMa 陪伴媽媽
            </div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>
              {isSpeaking ? '🔊 語音播報中…' : '🟢 在線陪伴中'}
            </div>
          </div>
        </div>

        {/* Right Action Icons (LINE Style) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 18 }}>
          <button style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontSize: 18 }} title="搜尋">🔍</button>
          <button
            style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontSize: 18 }}
            onClick={() => router.push('/sos?fakeCall=1')}
            title="撥打假電話"
          >
            📞
          </button>
          <button style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontSize: 18 }} title="安全記錄">📅</button>
          <button
            style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontSize: 18 }}
            onClick={() => setShowQuickPrompts(v => !v)}
            title="選單"
          >
            ☰
          </button>
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
                <Logo size={38} style={{ borderRadius: '50%', flexShrink: 0, marginTop: 2 }} />
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
            <Logo size={38} style={{ borderRadius: '50%', flexShrink: 0 }} />
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
          {['🏪 附近有超商嗎？', '😰 我有點害怕', '⏱️ 還要走多久？', '📞 撥打假電話'].map(prompt => (
            <button
              key={prompt}
              onClick={() => prompt === '📞 撥打假電話' ? router.push('/sos?fakeCall=1') : sendMsg(prompt.replace(/^[^\s]+\s*/, ''))}
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
              }}
            >
              {prompt}
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
        {/* Left Action Buttons (+, 📷, 🖼️) */}
        <button style={{ background: 'none', border: 'none', fontSize: 22, color: '#6B7280', cursor: 'pointer', padding: 0 }} title="更多">
          +
        </button>
        <button style={{ background: 'none', border: 'none', fontSize: 20, color: '#6B7280', cursor: 'pointer', padding: 0 }} title="相機">
          📷
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
            <button style={{ background: 'none', border: 'none', fontSize: 18, color: '#9CA3AF', cursor: 'pointer' }}>
              😊
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
            fontSize: 18,
            cursor: 'pointer',
            boxShadow: isListening ? '0 0 10px rgba(239,68,68,0.5)' : 'none',
            transition: 'all 0.2s ease',
          }}
          title={isListening ? '停止錄音' : '語音輸入'}
        >
          {isListening ? '⏹' : '🎙️'}
        </button>
      </div>
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
