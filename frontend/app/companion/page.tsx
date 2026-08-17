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

// Vector SVG Icons
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
function IconMicOff() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
}
function IconVolume2() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
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

// --- Gemini Live Audio Queue Player (24kHz Output) ---
class GeminiAudioPlayer {
  private ctx: AudioContext | null = null
  private nextStartTime = 0
  private activeSources: AudioBufferSourceNode[] = []
  private onSpeakingChange?: (isSpeaking: boolean) => void

  constructor(onSpeakingChange?: (isSpeaking: boolean) => void) {
    this.onSpeakingChange = onSpeakingChange
  }

  private initCtx() {
    if (!this.ctx) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new AudioCtx({ sampleRate: 24000 })
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }

  playPcmChunk(base64Data: string) {
    try {
      this.initCtx()
      if (!this.ctx) return

      const binary = atob(base64Data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      const int16 = new Int16Array(bytes.buffer)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0
      }

      const buffer = this.ctx.createBuffer(1, float32.length, 24000)
      buffer.getChannelData(0).set(float32)

      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.connect(this.ctx.destination)

      const now = this.ctx.currentTime
      if (this.nextStartTime < now) {
        this.nextStartTime = now + 0.05
      }

      source.start(this.nextStartTime)
      this.nextStartTime += buffer.duration
      this.activeSources.push(source)
      this.onSpeakingChange?.(true)

      source.onended = () => {
        const idx = this.activeSources.indexOf(source)
        if (idx !== -1) this.activeSources.splice(idx, 1)
        if (this.activeSources.length === 0) {
          this.onSpeakingChange?.(false)
        }
      }
    } catch (e) {
      console.warn('PCM playback error:', e)
    }
  }

  stopAll() {
    this.activeSources.forEach(src => {
      try { src.stop() } catch {}
    })
    this.activeSources = []
    this.nextStartTime = 0
    this.onSpeakingChange?.(false)
  }

  close() {
    this.stopAll()
    if (this.ctx) {
      this.ctx.close().catch(() => {})
      this.ctx = null
    }
  }
}

// Convert input Float32 audio to 16kHz PCM Int16 Base64
function pcmFloatTo16BitBase64(input: Float32Array, fromRate: number, toRate = 16000): string {
  let sampled: Float32Array
  if (fromRate === toRate) {
    sampled = input
  } else {
    const ratio = fromRate / toRate
    const newLen = Math.floor(input.length / ratio)
    sampled = new Float32Array(newLen)
    for (let i = 0; i < newLen; i++) {
      const idx = Math.floor(i * ratio)
      sampled[i] = input[idx] || 0
    }
  }

  const int16 = new Int16Array(sampled.length)
  for (let i = 0; i < sampled.length; i++) {
    const s = Math.max(-1, Math.min(1, sampled[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }

  let binary = ''
  const u8 = new Uint8Array(int16.buffer)
  for (let i = 0; i < u8.length; i++) {
    binary += String.fromCharCode(u8[i])
  }
  return btoa(binary)
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

  // Voice call states
  const [callActive, setCallActive] = useState(false)
  const [callState, setCallState] = useState<'ringing' | 'connected'>('ringing')
  const [callDuration, setCallDuration] = useState(0)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null)

  // Gemini Multimodal Live WS States
  const [momTranscript, setMomTranscript] = useState('「寶貝走到哪啦？媽媽隨時在聽你說喔！」')
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [userSpeaking, setUserSpeaking] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)

  const liveWsRef = useRef<WebSocket | null>(null)
  const playerRef = useRef<GeminiAudioPlayer | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micCtxRef = useRef<AudioContext | null>(null)
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const context: RouteContext = {
    origin: searchParams.get('origin') || '我的位置',
    destination: searchParams.get('destination') || '目的地',
    safetyScore: parseInt(searchParams.get('safety') || '85'),
    durationMin: Math.round(parseInt(searchParams.get('duration') || '600') / 60),
  }

  // Connect to backend chat WebSocket (gracefully skip if backend unavailable)
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
    if (!backendUrl) return
    try {
      const ws = new WebSocket(`${backendUrl.replace(/^http/, 'ws')}/stream/${userIdRef.current}`)
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data)
        const text = data.type === 'urgent' ? data.message : data.text
        pendingReplyRef.current?.({ text, audio: data.audio })
        pendingReplyRef.current = null
      }
      ws.onerror = () => {}
      wsRef.current = ws
      return () => ws.close()
    } catch {}
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const playAudio = useCallback((base64Wav: string) => {
    audioRef.current?.pause()
    const audio = new Audio(`data:audio/wav;base64,${base64Wav}`)
    audioRef.current = audio
    audio.onplay = () => setIsSpeaking(true)
    audio.onended = () => setIsSpeaking(false)
    audio.onerror = () => setIsSpeaking(false)
    audio.play().catch(() => setIsSpeaking(false))
  }, [])

  const speak = useCallback(async (text: string, urgent = false) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
    if (!backendUrl) return
    try {
      const res = await fetch(`${backendUrl}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, urgent }),
      })
      if (!res.ok) return
      const { audio } = await res.json()
      playAudio(audio)
    } catch {}
  }, [playAudio])

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

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const base64Data = (reader.result as string).split(',')[1]
      const userMsg: Message = { role: 'user', text: '📷 [上傳環境照片，評估風險中...]', timestamp: Date.now() }
      setMessages(prev => [...prev, userMsg])
      setIsThinking(true)

      try {
        const res = await fetch('/api/companion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', text: '請分析這張照片的周遭環境是否安全，路燈是否充足？' }],
            image: base64Data,
          }),
        })
        const data = await res.json()
        const replyText = data.text || '照片分析完成！周遭看起來正常，請繼續保持警覺走大馬路喔！'
        setMessages(prev => [...prev, { role: 'ai', text: replyText, timestamp: Date.now() }])
        speak(replyText)
      } catch {
        const replyText = '抱歉，照片分析暫時無法完成，但別擔心，媽咪在線上陪你！'
        setMessages(prev => [...prev, { role: 'ai', text: replyText, timestamp: Date.now() }])
      } finally {
        setIsThinking(false)
      }
    }
    reader.readAsDataURL(file)
  }, [speak])

  const startVoiceInput = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('您的瀏覽器不支援語音辨識，請使用 Chrome 瀏覽器。')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const rec = new SpeechRecognition()
    rec.lang = 'zh-TW'
    rec.interimResults = false
    rec.onstart = () => setIsListening(true)
    rec.onend = () => setIsListening(false)
    rec.onerror = () => setIsListening(false)
    rec.onresult = (e: AnySpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript
      if (transcript) sendMsg(transcript)
    }
    recognitionRef.current = rec
    rec.start()
  }, [isListening, sendMsg])

  // Call duration counter when connected
  useEffect(() => {
    if (!callActive || callState !== 'connected') return
    const timer = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => clearInterval(timer)
  }, [callActive, callState])

  const triggerAudioPlay = () => {
    setAudioUnlocked(true)
    if (ringtoneAudioRef.current && callState === 'ringing') {
      ringtoneAudioRef.current.play().catch(() => {})
    } else if (callState === 'ringing') {
      ringtoneAudioRef.current = new Audio('/line_ringtone.mp3')
      ringtoneAudioRef.current.loop = true
      ringtoneAudioRef.current.play().catch(() => {})
    }
  }

  // Ringtone playback while ringing
  useEffect(() => {
    if (callActive && callState === 'ringing') {
      if (!ringtoneAudioRef.current) {
        ringtoneAudioRef.current = new Audio('/line_ringtone.mp3')
        ringtoneAudioRef.current.loop = true
      }
      ringtoneAudioRef.current.play().then(() => setAudioUnlocked(true)).catch(() => setAudioUnlocked(false))
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

  // Clean up Gemini Live Call resources when call closes
  const stopLiveCallResources = useCallback(() => {
    if (scriptNodeRef.current) {
      scriptNodeRef.current.disconnect()
      scriptNodeRef.current = null
    }
    if (micCtxRef.current) {
      micCtxRef.current.close().catch(() => {})
      micCtxRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }
    if (playerRef.current) {
      playerRef.current.close()
      playerRef.current = null
    }
    if (liveWsRef.current) {
      liveWsRef.current.close()
      liveWsRef.current = null
    }
    setAiSpeaking(false)
    setUserSpeaking(false)
  }, [])

  useEffect(() => {
    return () => stopLiveCallResources()
  }, [stopLiveCallResources])

  const startVoiceCall = useCallback(() => {
    setCallState('ringing')
    setCallDuration(0)
    setCallActive(true)
  }, [])

  // Start Gemini Multimodal Live API Real-Time Audio Session
  const acceptVoiceCall = async () => {
    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.pause()
      ringtoneAudioRef.current.currentTime = 0
      ringtoneAudioRef.current = null
    }
    setCallState('connected')
    setMomTranscript('「連線中，媽咪準備聽你說話喔...」')

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_KEY || ''
    if (!apiKey) {
      setMomTranscript('「喂～寶貝走到哪了？記得走大馬路喔！」')
      return
    }

    try {
      playerRef.current = new GeminiAudioPlayer((speaking) => setAiSpeaking(speaking))

      // Connect to Gemini Multimodal Live API (bidiGenerateContent WebSocket)
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`
      const ws = new WebSocket(wsUrl)
      liveWsRef.current = ws

      ws.onopen = () => {
        const setupMsg = {
          setup: {
            model: 'models/gemini-2.5-flash-native-audio-latest',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Aoede',
                  },
                },
              },
            },
            systemInstruction: {
              parts: [{
                text: '你是一位溫暖親切的台灣媽媽，正在跟晚歸的女兒/兒子撥打 LINE 陪伴電話。說話口吻親切、溫暖、關心對方走夜路的安全，講話要像在通電話一樣簡短自然（例如：『寶貝走到哪啦？』『路燈亮不亮？』『快點回來，幫你煮了熱湯喔！』）。請用極度自然的語氣和對方說話。',
              }],
            },
          },
        }
        ws.send(JSON.stringify(setupMsg))
      }

      let currentTextBuffer = ''

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data)

          // 1. Setup complete -> Trigger initial greeting turn
          if (data.setupComplete) {
            const initialTurn = {
              clientContent: {
                turns: [{
                  role: 'user',
                  parts: [{ text: '（電話接通了，媽媽熱情地開口關心我走到哪裡了）' }],
                }],
                turnComplete: true,
              },
            }
            ws.send(JSON.stringify(initialTurn))
            startMicAudioStream(ws)
            return
          }

          // 2. Incoming Gemini audio/text content
          if (data.serverContent) {
            const parts = data.serverContent.modelTurn?.parts || []
            for (const p of parts) {
              if (p.inlineData?.data) {
                playerRef.current?.playPcmChunk(p.inlineData.data)
              }
              if (p.text) {
                currentTextBuffer += p.text
                setMomTranscript(`「${currentTextBuffer}」`)
              }
            }
            if (data.serverContent.turnComplete) {
              currentTextBuffer = ''
            }
            if (data.serverContent.interrupted) {
              playerRef.current?.stopAll()
              currentTextBuffer = ''
            }
          }
        } catch (err) {
          console.warn('WS Message parse error:', err)
        }
      }

      ws.onerror = (e) => {
        console.warn('Gemini Live WS error, fallback to static prompt:', e)
        setMomTranscript('「寶貝你走到哪啦？記得走大馬路快點回來喔！」')
      }
    } catch (e) {
      console.warn('Failed to start Live Audio Call:', e)
    }
  }

  // Capture Microphone Audio (16kHz PCM Int16 Base64 stream)
  const startMicAudioStream = async (ws: WebSocket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      micStreamRef.current = stream

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioCtx()
      micCtxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(2048, 1, 1)
      scriptNodeRef.current = processor

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return

        const inputBuffer = e.inputBuffer.getChannelData(0)

        // RMS VAD for user speaking detection & barge-in interruption
        let sum = 0
        for (let i = 0; i < inputBuffer.length; i++) {
          sum += inputBuffer[i] * inputBuffer[i]
        }
        const rms = Math.sqrt(sum / inputBuffer.length)

        if (rms > 0.04) {
          setUserSpeaking(true)
          // User is speaking -> Interrupt AI Mom's audio playback immediately!
          playerRef.current?.stopAll()
        } else {
          setUserSpeaking(false)
        }

        // ConvertFloat32 to PCM16 16kHz Base64
        const base64PCM = pcmFloatTo16BitBase64(inputBuffer, ctx.sampleRate, 16000)

        const realtimeMsg = {
          realtimeInput: {
            mediaChunks: [{
              mimeType: 'audio/pcm',
              data: base64PCM,
            }],
          },
        }
        ws.send(JSON.stringify(realtimeMsg))
      }

      source.connect(processor)
      processor.connect(ctx.destination)
    } catch (err) {
      console.warn('Microphone stream error:', err)
    }
  }

  const endVoiceCall = () => {
    stopLiveCallResources()
    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.pause()
      ringtoneAudioRef.current.currentTime = 0
    }
    setCallActive(false)

    setMessages(prev => [
      ...prev,
      {
        role: 'ai',
        text: '📞 LINE 語音通話已結束。',
        timestamp: Date.now(),
      },
    ])
  }

  const quickPrompts = [
    '附近路燈好像有點暗',
    '我感覺後面有人跟著我',
    '我大概再10分鐘到家',
    '幫我定位周遭超商',
  ]

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      background: '#7b9ebf', color: '#1F2937', fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Top Header */}
      <header style={{
        padding: '12px 16px', background: '#7b9ebf', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.2)',
        position: 'sticky', top: 0, zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => router.push('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: 'white' }}
          >
            <IconChevronLeft />
          </button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
              媽咪 (NightMaMa AI)
              <span style={{ fontSize: 10, background: '#06C755', color: 'white', padding: '2px 6px', borderRadius: 10 }}>LINE官方</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>安全分數 {context.safetyScore}分</span>
              <span>•</span>
              <span>預計 {context.durationMin} 分鐘</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Incoming Call trigger button */}
          <button
            onClick={startVoiceCall}
            style={{
              background: '#06C755', color: 'white', border: 'none',
              padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(6,199,85,0.4)', transition: 'transform 0.2s ease'
            }}
          >
            <IconPhoneCall />
            假裝來電
          </button>
          <button style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}>
            <IconSearch />
          </button>
        </div>
      </header>

      {/* Safety Alert Banner */}
      <div style={{
        background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
        padding: '8px 16px', fontSize: 12, color: 'white', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconShield />
          <span>一路平安模式啟用中 — 已鎖定路線導航</span>
        </div>
        <button
          onClick={() => router.push('/sos')}
          style={{ background: '#EF4444', color: 'white', border: 'none', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
        >
          SOS 求救
        </button>
      </div>

      {/* Main Chat Messages Container */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px 16px 120px',
        display: 'flex', flexDirection: 'column', gap: 12
      }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            {msg.role === 'ai' && (
              <div style={{
                width: 38, height: 38, borderRadius: '50%', background: '#FFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)', overflow: 'hidden', flexShrink: 0
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mom_avatar.jpg" alt="媽咪" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
              {msg.role === 'ai' && i === 0 && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', marginBottom: 2, marginLeft: 2 }}>媽咪</span>
              )}
              <div style={{
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
                background: msg.role === 'user' ? '#8B5CF6' : '#FFFFFF',
                color: msg.role === 'user' ? '#FFFFFF' : '#1F2937',
                fontSize: 14,
                lineHeight: 1.5,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                wordBreak: 'break-word',
              }}>
                {msg.text}
              </div>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2, padding: '0 4px' }}>
                {formatTime(msg.timestamp)}
              </span>
            </div>
          </div>
        ))}

        {isThinking && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mom_avatar.jpg" alt="媽咪" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ background: '#FFFFFF', padding: '10px 16px', borderRadius: '4px 18px 18px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <ThinkingDots />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestion Chips */}
      {showQuickPrompts && messages.length <= 2 && (
        <div style={{
          position: 'fixed', bottom: 70, left: 0, right: 0,
          padding: '0 16px', display: 'flex', gap: 8, overflowX: 'auto',
          zIndex: 10, scrollbarWidth: 'none'
        }}>
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => sendMsg(p)}
              style={{
                background: 'rgba(255,255,255,0.9)', border: 'none', color: '#4B5563',
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                cursor: 'pointer', flexShrink: 0
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input Bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '10px 12px', background: '#FFFFFF',
        borderTop: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 8,
        zIndex: 20
      }}>
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handlePhotoUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', padding: 6, display: 'flex' }}
          title="上傳照片評估環境風險"
        >
          <IconCamera />
        </button>

        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                sendMsg(input)
              }
            }}
            placeholder="傳送訊息給媽咪..."
            style={{
              width: '100%', padding: '10px 36px 10px 14px', borderRadius: 20,
              border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 14,
              outline: 'none'
            }}
          />
          <button
            onClick={() => sendMsg(input)}
            style={{
              position: 'absolute', right: 8, background: 'none', border: 'none',
              color: input.trim() ? '#8B5CF6' : '#D1D5DB', cursor: 'pointer', padding: 4
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>

        <button
          onClick={startVoiceInput}
          style={{
            background: isListening ? '#EF4444' : '#F3F4F6',
            color: isListening ? '#FFFFFF' : '#4B5563',
            border: 'none', borderRadius: '50%', width: 38, height: 38,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: isListening ? '0 0 10px rgba(239,68,68,0.5)' : 'none',
            transition: 'all 0.2s ease',
          }}
          title={isListening ? '停止錄音' : '語音輸入'}
        >
          <IconMic />
        </button>
      </div>

      {/* Full-screen LINE Voice Call Overlay (Gemini Live Audio Engine) */}
      {callActive && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: '#0F172A', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'space-between', padding: '50px 24px 60px', color: 'white'
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
              {/* Active Voice Call Screen */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', maxWidth: 360 }}>
                {/* Avatar with Dynamic Speaking Glow */}
                <div style={{ position: 'relative', marginTop: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/mom_avatar.jpg"
                    alt="媽咪"
                    style={{
                      width: 110, height: 110, borderRadius: '50%', objectFit: 'cover',
                      border: aiSpeaking ? '4px solid #06C755' : userSpeaking ? '4px solid #8B5CF6' : '4px solid rgba(255,255,255,0.3)',
                      boxShadow: aiSpeaking ? '0 0 28px rgba(6,199,85,0.8)' : userSpeaking ? '0 0 28px rgba(139,92,246,0.8)' : '0 8px 24px rgba(0,0,0,0.4)',
                      transition: 'all 0.3s ease'
                    }}
                  />
                  {aiSpeaking && (
                    <span style={{ position: 'absolute', bottom: 0, right: 0, background: '#06C755', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                      🔊 講話中
                    </span>
                  )}
                  {userSpeaking && (
                    <span style={{ position: 'absolute', bottom: 0, right: 0, background: '#8B5CF6', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                      🎙️ 聆聽中
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>媽咪</div>
                <div style={{ color: '#06C755', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06C755', animation: 'pulse 1s infinite' }} />
                  Gemini AI 雙向語音通話中 {String(Math.floor(callDuration / 60)).padStart(2, '0')}:{String(callDuration % 60).padStart(2, '0')}
                </div>

                {/* Animated Voice Soundwaves */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 24, margin: '8px 0' }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 4,
                        height: aiSpeaking ? `${12 + (i % 3) * 10}px` : userSpeaking ? `${8 + (i % 2) * 8}px` : '4px',
                        background: aiSpeaking ? '#06C755' : userSpeaking ? '#8B5CF6' : 'rgba(255,255,255,0.3)',
                        borderRadius: 2,
                        transition: 'all 0.15s ease',
                      }}
                    />
                  ))}
                </div>

                {/* Live Caption Card */}
                <div style={{
                  color: '#F3F4F6', textAlign: 'center', fontSize: 15,
                  padding: '16px 20px', borderRadius: 20, lineHeight: 1.6,
                  width: '100%', background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.2)', minHeight: 80,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {momTranscript}
                </div>
              </div>

              {/* Call Controls Bar */}
              <div style={{ display: 'flex', gap: 40, alignItems: 'center' }}>
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: isMuted ? '#EF4444' : 'rgba(255,255,255,0.15)',
                    border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.2s ease'
                  }}
                  title={isMuted ? '解除靜音' : '靜音'}
                >
                  {isMuted ? <IconMicOff /> : <IconMic />}
                </button>

                <button
                  onClick={endVoiceCall}
                  style={{
                    width: 72, height: 72, borderRadius: '50%', background: '#EF4444',
                    border: 'none', color: 'white', fontSize: 32, cursor: 'pointer',
                    boxShadow: '0 4px 20px rgba(239,68,68,0.6)', transition: 'transform 0.15s ease'
                  }}
                >
                  📵 掛斷
                </button>

                <button
                  onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                  style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: isSpeakerOn ? '#06C755' : 'rgba(255,255,255,0.15)',
                    border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.2s ease'
                  }}
                  title="擴音"
                >
                  <IconVolume2 />
                </button>
              </div>
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
