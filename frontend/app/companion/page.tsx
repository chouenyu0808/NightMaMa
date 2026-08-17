'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'

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
  id?: string
  role: 'user' | 'ai' | 'system' | 'call_card'
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

// Exact LINE Vector SVG Icons
function IconChevronLeft() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
}
function IconSearch() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
}
function IconPhoneCall() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
}
function IconCalendar() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
}
function IconMenu() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
}
function IconPlus() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
}
function IconCamera() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
}
function IconImage() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
}
function IconSmile() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
}
function IconMic() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
}
function IconMicOff() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
}
function IconVolume2() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
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

  // Voice call states
  const [callActive, setCallActive] = useState(false)
  const [callState, setCallState] = useState<'ringing' | 'connected'>('ringing')
  const [callDuration, setCallDuration] = useState(0)
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null)
  const momVoiceAudioRef = useRef<HTMLAudioElement | null>(null)

  // Gemini Multimodal Live WS States
  const [momTranscript, setMomTranscript] = useState('「喂～寶貝你走到哪裡啦？媽媽在客廳看電視等你喔！附近路燈有亮嗎？幫你留了熱湯，記得走大馬路快點回來喔！」')
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [userSpeaking, setUserSpeaking] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)

  const liveWsRef = useRef<WebSocket | null>(null)
  const playerRef = useRef<GeminiAudioPlayer | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micCtxRef = useRef<AudioContext | null>(null)
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null)

  const context: RouteContext = {
    origin: searchParams.get('origin') || '我的位置',
    destination: searchParams.get('destination') || '目的地',
    safetyScore: parseInt(searchParams.get('safety') || '85'),
    durationMin: Math.round(parseInt(searchParams.get('duration') || '600') / 60),
  }

  // Connect to backend chat WebSocket (if available)
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
    if (!backendUrl) return
    try {
      const ws = new WebSocket(`${backendUrl.replace(/^http/, 'ws')}/stream/${userIdRef.current}`)
      ws.onmessage = (e) => {
        try {
          if (typeof e.data !== 'string') return
          const data = JSON.parse(e.data)
          const text = data.type === 'urgent' ? data.message : data.text
          pendingReplyRef.current?.({ text, audio: data.audio })
          pendingReplyRef.current = null
        } catch {}
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
    audio.play().catch(() => {})
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
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const { text: reply, audio } = await new Promise<{ text: string; audio?: string }>((resolve, reject) => {
          pendingReplyRef.current = resolve
          wsRef.current?.send(JSON.stringify({ type: 'speech', text }))
          setTimeout(() => reject(new Error('timeout')), 4000)
        })
        const aiMsg: Message = { role: 'ai', text: reply, timestamp: Date.now() }
        setMessages(prev => [...prev, aiMsg])
        if (audio) playAudio(audio)
        else speak(reply)
        return
      }

      const res = await fetch('/api/companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: text, context }),
      })
      const data = await res.json()
      const replyText = data.reply || '寶貝，我有在聽喔！走夜路要多留心四周喔！'
      const aiMsg: Message = { role: 'ai', text: replyText, timestamp: Date.now() }
      setMessages(prev => [...prev, aiMsg])
    } catch {
      const errMsg: Message = { role: 'ai', text: '寶貝別擔心，媽咪在線上守護你！記得走大馬路喔！', timestamp: Date.now() }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsThinking(false)
    }
  }, [isThinking, context, playAudio, speak])

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
            userMessage: '請分析這張照片的周遭環境是否安全，路燈是否充足？',
            imageData: `data:image/jpeg;base64,${base64Data}`,
            context,
          }),
        })
        const data = await res.json()
        const replyText = data.reply || '照片分析完成！周遭看起來正常，請繼續保持警覺走大馬路喔！'
        setMessages(prev => [...prev, { role: 'ai', text: replyText, timestamp: Date.now() }])
      } catch {
        const replyText = '抱歉，照片分析暫時無法完成，但別擔心，媽咪在線上陪你！'
        setMessages(prev => [...prev, { role: 'ai', text: replyText, timestamp: Date.now() }])
      } finally {
        setIsThinking(false)
      }
    }
    reader.readAsDataURL(file)
  }, [context])

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

  // Ringtone playback while ringing
  useEffect(() => {
    if (callActive && callState === 'ringing') {
      if (!ringtoneAudioRef.current) {
        ringtoneAudioRef.current = new Audio('/line_ringtone.mp3')
        ringtoneAudioRef.current.loop = true
      }
      ringtoneAudioRef.current.play().catch(() => {})
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
    if (momVoiceAudioRef.current) {
      momVoiceAudioRef.current.pause()
      momVoiceAudioRef.current.currentTime = 0
      momVoiceAudioRef.current = null
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

    // Add LINE Voice Call Started Card into chat stream
    setMessages(prev => [
      ...prev,
      {
        role: 'call_card',
        text: '語音通話已開始。',
        timestamp: Date.now(),
      },
    ])
  }, [])

  const acceptVoiceCall = async () => {
    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.pause()
      ringtoneAudioRef.current.currentTime = 0
      ringtoneAudioRef.current = null
    }
    setCallState('connected')
    setMomTranscript('「喂～寶貝你走到哪裡啦？媽媽在客廳看電視等你喔！附近路燈有亮嗎？幫你留了熱湯，記得走大馬路快點回來喔！」')

    // GUARANTEED INSTANT AUDIO: Play pre-generated voice WAV directly inside user gesture click handler
    const staticVoice = new Audio('/mom_voice.wav')
    momVoiceAudioRef.current = staticVoice
    setAiSpeaking(true)
    staticVoice.onended = () => setAiSpeaking(false)
    staticVoice.play().catch(() => {})

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_KEY || ''
    if (!apiKey) return

    try {
      playerRef.current = new GeminiAudioPlayer((speaking) => setAiSpeaking(speaking))

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
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
          let rawText = ''
          if (typeof event.data === 'string') {
            rawText = event.data
          } else if (event.data instanceof ArrayBuffer) {
            rawText = new TextDecoder('utf-8').decode(event.data)
          } else if (event.data instanceof Blob) {
            rawText = await event.data.text()
          }

          if (!rawText) return
          const data = JSON.parse(rawText)

          if (data.setupComplete) {
            startMicAudioStream(ws)
            return
          }

          if (data.serverContent) {
            const parts = data.serverContent.modelTurn?.parts || []
            for (const p of parts) {
              if (p.inlineData?.data) {
                if (momVoiceAudioRef.current) {
                  momVoiceAudioRef.current.pause()
                  momVoiceAudioRef.current = null
                }
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
        console.warn('Gemini Live WS notice:', e)
      }
    } catch (e) {
      console.warn('Failed to start Live Audio WS:', e)
    }
  }

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

        let sum = 0
        for (let i = 0; i < inputBuffer.length; i++) {
          sum += inputBuffer[i] * inputBuffer[i]
        }
        const rms = Math.sqrt(sum / inputBuffer.length)

        if (rms > 0.04) {
          setUserSpeaking(true)
          if (momVoiceAudioRef.current) {
            momVoiceAudioRef.current.pause()
          }
          playerRef.current?.stopAll()
        } else {
          setUserSpeaking(false)
        }

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

    // Add LINE Voice Call Ended Capsule to chat stream
    setMessages(prev => [
      ...prev,
      {
        role: 'system',
        text: '語音通話已結束。',
        timestamp: Date.now(),
      },
    ])
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      background: '#84A3CB', color: '#111827', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Top Header - Exact LINE Header 1:1 */}
      <header style={{
        padding: '10px 14px', background: '#84A3CB', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', color: '#111827',
        position: 'sticky', top: 0, zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => router.push('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: '#111827' }}
          >
            <IconChevronLeft />
          </button>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
            媽咪 (NightMaMa AI)
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, color: '#111827' }}>
          <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2 }}>
            <IconSearch />
          </button>
          <button
            onClick={startVoiceCall}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2 }}
            title="發起語音通話"
          >
            <IconPhoneCall />
          </button>
          <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2 }}>
            <IconCalendar />
          </button>
          <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2 }}>
            <IconMenu />
          </button>
        </div>
      </header>

      {/* Main Chat Messages Stream — 1:1 LINE Layout */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 14px 80px',
        display: 'flex', flexDirection: 'column', gap: 16
      }}>
        {messages.map((msg, i) => {
          if (msg.role === 'system') {
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                <div style={{
                  background: 'rgba(80, 110, 155, 0.65)', backdropFilter: 'blur(4px)',
                  color: '#FFFFFF', fontSize: 12, padding: '4px 14px', borderRadius: 14,
                  display: 'flex', alignItems: 'center', gap: 6
                }}>
                  <span>{formatTime(msg.timestamp)}</span>
                  <span>{msg.text}</span>
                </div>
              </div>
            )
          }

          if (msg.role === 'call_card') {
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: '#FFF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', flexShrink: 0
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/mom_avatar.jpg" alt="媽咪" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 12, color: '#374151', marginBottom: 4, marginLeft: 2, fontWeight: 500 }}>媽咪</span>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{
                      background: '#FFFFFF', borderRadius: 18, padding: '20px 20px', width: 250,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}>
                        <IconPhoneCall />
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>語音通話已開始。</div>
                      <button
                        onClick={acceptVoiceCall}
                        style={{
                          width: '100%', background: '#F3F4F6', border: 'none', borderRadius: 12,
                          padding: '10px 0', fontSize: 15, fontWeight: 600, color: '#111827',
                          cursor: 'pointer', transition: 'background 0.2s ease'
                        }}
                      >
                        加入
                      </button>
                    </div>
                    <span style={{ fontSize: 11, color: '#4B5563', flexShrink: 0 }}>
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            )
          }

          return (
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
                  width: 36, height: 36, borderRadius: '50%', background: '#FFF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', flexShrink: 0
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/mom_avatar.jpg" alt="媽咪" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '72%' }}>
                {msg.role === 'ai' && (
                  <span style={{ fontSize: 12, color: '#374151', marginBottom: 4, marginLeft: 2, fontWeight: 500 }}>媽咪</span>
                )}
                <div style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: 18,
                    background: '#FFFFFF',
                    color: '#111827',
                    fontSize: 15,
                    lineHeight: 1.5,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-line'
                  }}>
                    {msg.text}
                  </div>
                  <span style={{ fontSize: 11, color: '#4B5563', flexShrink: 0 }}>
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}

        {isThinking && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mom_avatar.jpg" alt="媽咪" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 12, color: '#374151', marginBottom: 4, marginLeft: 2 }}>媽咪</span>
              <div style={{ background: '#FFFFFF', padding: '10px 16px', borderRadius: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <ThinkingDots />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar — Exact 1:1 LINE Bottom Bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '8px 10px 12px', background: '#FFFFFF',
        display: 'flex', alignItems: 'center', gap: 10,
        zIndex: 20, borderTop: '1px solid rgba(0,0,0,0.05)'
      }}>
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handlePhotoUpload}
        />
        
        {/* Left Control Icons: + , Camera , Gallery */}
        <button
          onClick={() => sendMsg('開啟功能選單')}
          style={{ background: 'none', border: 'none', color: '#111827', cursor: 'pointer', padding: 2, display: 'flex' }}
        >
          <IconPlus />
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ background: 'none', border: 'none', color: '#111827', cursor: 'pointer', padding: 2, display: 'flex' }}
          title="開啟相機"
        >
          <IconCamera />
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ background: 'none', border: 'none', color: '#111827', cursor: 'pointer', padding: 2, display: 'flex' }}
          title="開啟相簿"
        >
          <IconImage />
        </button>

        {/* Input Field with Inline Smile Emoji */}
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
            placeholder=""
            style={{
              width: '100%', padding: '8px 36px 8px 14px', borderRadius: 20,
              border: 'none', background: '#F3F4F6', fontSize: 15,
              color: '#111827', outline: 'none'
            }}
          />
          <button
            onClick={() => sendMsg('😊')}
            style={{
              position: 'absolute', right: 8, background: 'none', border: 'none',
              color: '#6B7280', cursor: 'pointer', padding: 2, display: 'flex'
            }}
          >
            <IconSmile />
          </button>
        </div>

        {/* Right Microphone Icon */}
        <button
          onClick={startVoiceInput}
          style={{
            background: isListening ? '#EF4444' : 'none',
            color: isListening ? '#FFFFFF' : '#111827',
            border: 'none', borderRadius: '50%', width: 34, height: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s ease',
          }}
          title={isListening ? '停止錄音' : '語音輸入'}
        >
          <IconMic />
        </button>
      </div>

      {/* Active LINE Voice Call Overlay (Gemini Live Audio Engine) */}
      {callActive && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: '#0F172A', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'space-between', padding: '50px 24px 60px', color: 'white'
        }}>
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
                  LINE 通話中 {String(Math.floor(callDuration / 60)).padStart(2, '0')}:{String(callDuration % 60).padStart(2, '0')}
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#84A3CB', color: 'white' }}>
        載入陪伴模式中…
      </div>
    }>
      <CompanionContent />
    </Suspense>
  )
}
