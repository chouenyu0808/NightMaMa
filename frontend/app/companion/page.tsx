'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'

import { NavBar } from '@/app/components/NavBar'
import AnxietyReportModal from '@/app/components/AnxietyReportModal'
import { COMPANION_TOOLS } from '@/lib/companionTools'
import { primaryContact, sendLineNotification } from '@/lib/emergencyContacts'
import {
  IconPhoneOff, IconChevronLeft, IconSearch, IconPhoneCall, IconCalendar, IconMenu,
  IconPlus, IconCamera, IconImage, IconSmile, IconMic, IconMicOff, IconVolume2,
  IconAlertTriangle, IconMessageCircle,
} from '@/components/Icons'
import { getUserId } from '@/lib/user'

interface RouteContext {
  origin: string
  destination: string
  /** null = 後端安全評分無法取得，AI 不應假裝知道分數 */
  safetyScore: number | null
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

/**
 * 安全評分只有在後端真的算出來時才存在。取不到就回傳 null，
 * 讓 AI 提示詞說「評分尚未取得」而不是隨口報一個 85 分。
 */
function resolveSafetyScore(fromProps: number | null | undefined, fromQuery: string | null): number | null {
  if (typeof fromProps === 'number') return fromProps
  if (fromQuery === null || fromQuery === '') return null
  const parsed = Number.parseInt(fromQuery, 10)
  return Number.isFinite(parsed) ? parsed : null
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

// --- Voice-triggered navigation: geocoding + backend route/store lookups ---
interface RouteApiOption {
  type: string
  duration_min: number
  distance_m: number
  score: number
  polyline: string
  light_count: number
  camera_count: number
  police_count: number
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''
  if (!apiKey) return null
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=tw&key=${apiKey}`)
    const data = await res.json()
    const loc = data.results?.[0]?.geometry?.location
    return loc ? { lat: loc.lat, lng: loc.lng } : null
  } catch {
    return null
  }
}

async function callRoutesApi(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  weightOverrides?: Record<string, number>,
  waypoints?: Array<{ lat: number; lng: number }>
): Promise<RouteApiOption[] | null> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  if (!backendUrl) return null
  try {
    const res = await fetch(`${backendUrl}/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, weight_overrides: weightOverrides, waypoints }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.routes || null
  } catch {
    return null
  }
}

async function callNearestStore(lat: number, lng: number): Promise<{ found: boolean; name?: string; lat?: number; lng?: number } | null> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  if (!backendUrl) return null
  try {
    const res = await fetch(`${backendUrl}/places/nearest-store?lat=${lat}&lng=${lng}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function buildNavigateParams(route: RouteApiOption, originName: string, destinationName: string): URLSearchParams {
  const params = new URLSearchParams()
  params.set('polyline', route.polyline)
  params.set('origin', originName)
  params.set('destination', destinationName)
  params.set('duration', String(Math.round(route.duration_min * 60)))
  params.set('distance', String(Math.round(route.distance_m)))
  params.set('safety', String(Math.round(route.score)))
  params.set('lights', String(route.light_count))
  params.set('cctv', String(route.camera_count))
  return params
}

export interface CompanionContentProps {
  embeddedInNav?: boolean
  onCloseNav?: () => void
  routeContext?: {
    origin: string
    destination: string
    safetyScore: number | null
    durationSec: number
  }
}

export function CompanionContent({ embeddedInNav = false, onCloseNav, routeContext }: CompanionContentProps = {}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<AnySpeechRecognition | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingReplyRef = useRef<((data: { text: string; audio?: string }) => void) | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const userIdRef = useRef<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null)

  /**
   * AI 判斷需要求救時，先進入待送出狀態跑倒數，而不是立刻發出。
   * 模型有機會誤判，讓一段對話就無條件驚動聯絡人不可接受；
   * 但要求使用者按確認，在真的遇到危險時又太慢。倒數＋可取消是折衷。
   */
  const [pendingAlert, setPendingAlert] = useState<{
    reason: string
    location: { lat: number; lng: number } | null
  } | null>(null)
  const [alertCountdown, setAlertCountdown] = useState(5)
  const [alertResult, setAlertResult] = useState<{ ok: boolean; text: string } | null>(null)

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
  // Accumulate full voice call transcript for Firestore persistence
  const callTranscriptRef = useRef<Array<{ role: string; text: string }>>([])

  const context: RouteContext = {
    origin: routeContext?.origin || (searchParams ? searchParams.get('origin') : null) || '我的位置',
    destination: routeContext?.destination || (searchParams ? searchParams.get('destination') : null) || '目的地',
    safetyScore: resolveSafetyScore(routeContext?.safetyScore, searchParams ? searchParams.get('safety') : null),
    durationMin: routeContext ? Math.round(routeContext.durationSec / 60) : Math.round(parseInt((searchParams ? searchParams.get('duration') : null) || '600') / 60),
  }

  // 匿名 user_id 在掛載後才初始化。先前是在 render 期間直接寫 ref，
  // 而 getUserId() 依賴 localStorage，在 SSR 期間本來就取不到值。
  // 這個 effect 宣告在其他 effect 之前，因此它們都能讀到已設定的值。
  useEffect(() => {
    if (!userIdRef.current) userIdRef.current = getUserId() || crypto.randomUUID()
  }, [])

  // Fire-and-forget: persist a message to Firestore via backend
  const saveMessageToFirestore = useCallback((role: string, text: string) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
    if (!backendUrl || !userIdRef.current) return
    fetch(`${backendUrl}/users/${userIdRef.current}/sessions/current/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, text }),
    }).catch(() => {}) // silent fail — don't block UI
  }, [])

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

  // Track live GPS position for voice-triggered route planning (find_lit_road_now etc.)
  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      pos => { userLocationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude } },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
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

  /** 實際把求救訊息送給緊急聯絡人。 */
  const dispatchEmergencyAlert = useCallback(async (
    reason: string,
    location: { lat: number; lng: number } | null
  ) => {
    const contact = primaryContact()
    const mapsUrl = location ? `https://maps.google.com/?q=${location.lat},${location.lng}` : ''
    const message =
      `🚨【NightMaMa 緊急求救】\n${reason}\n\n` +
      (location ? `📍 我的即時位置：${mapsUrl}\n` : `📍 定位失敗，未能取得位置\n`) +
      `⏰ ${new Date().toLocaleString('zh-TW')}\n\n這則訊息由 AI 陪伴助理在偵測到危險時發出，請立即與我聯繫確認。`

    const outcome = await sendLineNotification(message, contact?.lineUserId)
    if (outcome.sent) {
      setAlertResult({ ok: true, text: outcome.message })
      return
    }
    setAlertResult({ ok: false, text: outcome.message })
    if (outcome.shareUrl) window.location.assign(outcome.shareUrl)
  }, [])

  // 待送出的求救倒數。倒數歸零就送出；使用者可在這 5 秒內取消。
  useEffect(() => {
    if (!pendingAlert) return
    // 起始值包在 microtask 裡設定，避開 effect body 內同步 setState
    queueMicrotask(() => setAlertCountdown(5))
    let n = 5
    const t = setInterval(() => {
      n -= 1
      setAlertCountdown(n)
      if (n <= 0) {
        clearInterval(t)
        setPendingAlert(null)
        dispatchEmergencyAlert(pendingAlert.reason, pendingAlert.location)
      }
    }, 1000)
    return () => clearInterval(t)
  }, [pendingAlert, dispatchEmergencyAlert])

  /**
   * 執行 AI 要求的工具，回傳給使用者看的訊息。
   *
   * 刻意回傳結果而不是直接寫進 WebSocket：文字聊天沒有 ws，
   * 但需要完全相同的執行邏輯。呼叫端自行決定要不要把結果回送給模型。
   */
  const runToolCall = useCallback(async (
    fc: { id?: string; name: string; args?: Record<string, unknown> }
  ): Promise<{ resultMessage: string; navParams: URLSearchParams | null }> => {
    let resultMessage = ''
    let navParams: URLSearchParams | null = null

    try {
      let origin = userLocationRef.current
      if (!origin) {
        origin = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
          if (!navigator.geolocation) return resolve(null)
          navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 5000 }
          )
        })
      }

      if (!origin) {
        resultMessage = '目前無法取得你的 GPS 位置，請確認已開啟定位權限喔。'
      } else if (fc.name === 'plan_safe_route') {
        const destinationName = String(fc.args?.destination || context.destination)
        const destPoint = await geocodeAddress(destinationName)
        if (!destPoint) {
          resultMessage = `找不到「${destinationName}」的位置，可以再說一次地址嗎？`
        } else {
          const routes = await callRoutesApi(origin, destPoint, { light: 3, camera: 2, store: 1.5, police: 1.5, time: 0.5 })
          if (routes?.length) {
            const best = routes[0]
            resultMessage = `已經幫你規劃一條最安全、避開小巷的路線到${destinationName}，路上有 ${best.light_count} 盞路燈，大約 ${Math.round(best.duration_min)} 分鐘，馬上帶你去看地圖！`
            navParams = buildNavigateParams(best, context.origin, destinationName)
          } else {
            resultMessage = '抱歉，暫時沒辦法規劃路線，等一下再試一次好嗎？'
          }
        }
      } else if (fc.name === 'plan_route_via_store') {
        const destinationName = String(fc.args?.destination || context.destination)
        const destPoint = await geocodeAddress(destinationName)
        if (!destPoint) {
          resultMessage = `找不到「${destinationName}」的位置，可以再說一次地址嗎？`
        } else {
          const store = await callNearestStore(origin.lat, origin.lng)
          if (store?.found && store.lat != null && store.lng != null) {
            const routes = await callRoutesApi(origin, destPoint, undefined, [{ lat: store.lat, lng: store.lng }])
            if (routes?.length) {
              resultMessage = `幫你規劃一條會先經過「${store.name}」的路線，再到${destinationName}，大約 ${Math.round(routes[0].duration_min)} 分鐘，馬上帶你去看地圖！`
              navParams = buildNavigateParams(routes[0], context.origin, destinationName)
            } else {
              resultMessage = '抱歉，暫時沒辦法規劃經過超商的路線。'
            }
          } else {
            resultMessage = '附近暫時找不到營業中的 24 小時超商，我直接幫你規劃安全路線。'
            const routes = await callRoutesApi(origin, destPoint)
            if (routes?.length) {
              navParams = buildNavigateParams(routes[0], context.origin, destinationName)
            }
          }
        }
      } else if (fc.name === 'find_lit_road_now') {
        const destinationName = context.destination
        const destPoint = await geocodeAddress(destinationName)
        if (!destPoint) {
          resultMessage = '別擔心，深呼吸，媽咪這就在線上陪你，先跟我說你現在附近有什麼標的物好嗎？'
        } else {
          const routes = await callRoutesApi(origin, destPoint, { light: 5, camera: 2, store: 1, police: 1.5, time: 0.3 })
          if (routes?.length) {
            const best = routes[0]
            resultMessage = `別怕，媽咪馬上帶你走最亮的大馬路，這條路有 ${best.light_count} 盞路燈，馬上幫你導航！`
            navParams = buildNavigateParams(best, context.origin, destinationName)
          } else {
            resultMessage = '媽咪在線上陪你，深呼吸，先待在原地明亮的地方，我馬上幫你想辦法。'
          }
        }
      } else if (fc.name === 'trigger_emergency_alert') {
        // AI 不直接送出求救 —— 交給 UI 跑 5 秒倒數，使用者可以取消。
        // 模型有可能誤判，讓一段對話就無條件驚動聯絡人是不可接受的；
        // 但反過來要求使用者按確認，在真的遇到危險時又太慢。
        // 倒數＋可取消是兩者之間唯一說得過去的折衷。
        const reason = String(fc.args?.reason || '使用者透過 AI 陪伴功能求救')
        setPendingAlert({ reason, location: origin })
        resultMessage = `我已經準備好把你的位置傳給緊急聯絡人了，5 秒後自動送出，如果是誤會可以按取消。`
      } else {
        resultMessage = '好的。'
      }
    } catch (err) {
      console.warn('Tool call handling error:', err)
      resultMessage = '抱歉，剛剛處理的時候出了點問題，請再說一次好嗎？'
    }

    if (navParams) {
      const params = navParams
      setTimeout(() => {
        router.push(`/navigate?${params.toString()}`)
      }, 1500)
    }

    return { resultMessage, navParams }
  }, [context, router])

  /** 語音通話用的包裝：執行工具後把結果回送給 Gemini Live。 */
  const handleToolCall = useCallback(async (
    fc: { id?: string; name: string; args?: Record<string, unknown> },
    ws: WebSocket
  ) => {
    const { resultMessage } = await runToolCall(fc)
    try {
      ws.send(JSON.stringify({
        toolResponse: {
          functionResponses: [
            { id: fc.id, name: fc.name, response: { result: resultMessage } },
          ],
        },
      }))
    } catch (err) {
      console.warn('Failed to send toolResponse:', err)
    }
  }, [runToolCall])

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

      // Fallback: /api/companion — save both messages to Firestore
      saveMessageToFirestore('user', text.trim())
      const res = await fetch('/api/companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: text,
          // 帶最近幾則對話，AI 才判讀得出情緒變化而不是只看單句
          history: messages.slice(-6).map(m => ({ role: m.role, text: m.text })),
          // 即時座標：先前完全沒傳，AI 對使用者在哪一無所知
          context: { ...context, location: userLocationRef.current },
        }),
      })
      const data = await res.json()

      // 模型決定要行動時會回 action。執行需要瀏覽器端的 GPS 與導航，
      // 所以由這裡呼叫與語音通話完全相同的那套執行邏輯。
      if (data.action?.name) {
        if (data.reply?.trim()) {
          setMessages(prev => [...prev, { role: 'ai', text: data.reply.trim(), timestamp: Date.now() }])
        }
        const { resultMessage } = await runToolCall(data.action)
        if (resultMessage) {
          setMessages(prev => [...prev, { role: 'ai', text: resultMessage, timestamp: Date.now() }])
          saveMessageToFirestore('assistant', resultMessage)
        }
        return
      }

      const replyText = data.reply || '寶貝，我有在聽喔！走夜路要多留心四周喔！'
      const aiMsg: Message = { role: 'ai', text: replyText, timestamp: Date.now() }
      setMessages(prev => [...prev, aiMsg])
      saveMessageToFirestore('assistant', replyText)
    } catch {
      const errMsg: Message = { role: 'ai', text: '寶貝別擔心，媽咪在線上守護你！記得走大馬路喔！', timestamp: Date.now() }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsThinking(false)
    }
  }, [isThinking, context, messages, playAudio, speak, saveMessageToFirestore, runToolCall])

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const base64Data = (reader.result as string).split(',')[1]
      const userMsg: Message = { role: 'user', text: '[上傳環境照片，評估風險中...]', timestamp: Date.now() }
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
        saveMessageToFirestore('user', '[上傳環境照片]')
        saveMessageToFirestore('assistant', replyText)
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
    callTranscriptRef.current = []

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

  // Executes a Gemini Live function call (voice-triggered route planning), sends the
  // toolResponse back on the WS so the AI can confirm verbally, then navigates to /navigate.

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

    // 嘗試換發 ephemeral token；如果失敗，fallback 到直接用 API key 連線。
    // ephemeral token: v1alpha + BidiGenerateContentConstrained + access_token=
    // API key 直連:   v1beta  + BidiGenerateContent            + key=
    let wsUrl = ''
    try {
      const tokenRes = await fetch('/api/live-token', { method: 'POST' })
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json()
        const liveToken = typeof tokenData?.token === 'string' ? tokenData.token : ''
        if (liveToken) {
          wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(liveToken)}`
        }
      }
    } catch {}

    // Fallback: 直接使用 NEXT_PUBLIC_GEMINI_KEY 作為 API key 連線
    if (!wsUrl) {
      const directKey = process.env.NEXT_PUBLIC_GEMINI_KEY || ''
      if (!directKey) return
      wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(directKey)}`
    }

    console.log('[DEBUG] Gemini Live WS connecting via:', wsUrl.includes('access_token') ? 'ephemeral token (Constrained)' : 'direct API key')

    try {
      playerRef.current = new GeminiAudioPlayer((speaking) => setAiSpeaking(speaking))

      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      liveWsRef.current = ws

      ws.onopen = () => {
        console.log('[DEBUG] Gemini Live WS opened')
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
                text: `CRITICAL INSTRUCTION: You are a warm Taiwanese mother on a LINE voice call with your child who is walking home at night.
RULES:
1. You MUST speak ONLY in Traditional Chinese (cmn-Hant-TW).
2. DO NOT output any English words, thinking process, reasoning steps, or markdown formatting under any circumstances.
3. Speak directly as the mother in short, warm, caring Taiwanese conversational sentences (e.g. 「寶貝走到哪啦？」「附近路燈亮不亮？」「快點回來，幫你留了熱湯喔！」).
4. You can plan real walking routes for your child. When they ask for the safest route, a route that passes a 24-hour convenience store, or urgently want to reach a bright main road, call the matching function (plan_safe_route / plan_route_via_store / find_lit_road_now) instead of just talking about it. After calling a function, briefly and warmly tell them what you just arranged in Traditional Chinese.
5. Read their emotional state from tone and wording (relaxed / uneasy / afraid / panicking) and act on it. If they are afraid, call find_lit_road_now. If they describe an actual physical threat (someone is following me, someone grabbed me, call the police), call trigger_emergency_alert immediately. Do not stop at asking "do you want me to help?" — take the action, then say what you did in one short sentence.

CURRENT CONTEXT
- Destination: ${context.destination}
- Safety score: ${typeof context.safetyScore === 'number' ? `${context.safetyScore}/100` : 'not available — do not invent one'}
- Minutes remaining: about ${context.durationMin}`,
              }],
            },
            // 與文字聊天共用同一份宣告，避免兩條路徑能力不一致
            tools: [{ functionDeclarations: COMPANION_TOOLS }],
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
          console.log('[DEBUG] WS message received:', data)

          if (data.setupComplete) {
            console.log('[DEBUG] setupComplete received, starting mic stream')
            startMicAudioStream(ws)
            return
          }

          if (data.toolCall) {
            console.log('[DEBUG] toolCall received:', data.toolCall)
            const calls = data.toolCall.functionCalls || []
            for (const fc of calls) {
              handleToolCall(fc, ws)
            }
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
                // Filter out English chain-of-thought / internal monologue text
                const text = p.text.trim()
                const isEnglishMeta = /[a-zA-Z]/.test(text) && (text.includes('**') || text.includes('Okay') || text.includes('persona') || text.includes('audio') || text.includes('Acknowledge'))
                if (!isEnglishMeta && !text.startsWith('**')) {
                  currentTextBuffer += p.text
                  setMomTranscript(`「${currentTextBuffer}」`)
                }
              }
            }
            if (data.serverContent.turnComplete) {
              if (currentTextBuffer.trim()) {
                callTranscriptRef.current.push({ role: 'assistant', text: currentTextBuffer.trim() })
              }
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

      ws.onclose = (e) => {
        console.warn('[DEBUG] Gemini Live WS closed. code=', e.code, 'reason=', e.reason, 'wasClean=', e.wasClean)
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

        if (Math.random() < 0.02) {
          console.log('[DEBUG] mic rms level:', rms.toFixed(4))
        }

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
              mimeType: 'audio/pcm;rate=16000',
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

    // Save voice call transcript to Firestore
    const transcript = callTranscriptRef.current
    if (transcript.length > 0) {
      // Save a summary record of the call
      saveMessageToFirestore('user', `[語音通話 ${Math.floor(callDuration / 60)}:${String(callDuration % 60).padStart(2, '0')}]`)
      // Save each AI turn from the call
      for (const entry of transcript) {
        saveMessageToFirestore(entry.role, entry.text)
      }
    }
    callTranscriptRef.current = []

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

  const [showAnxietyModal, setShowAnxietyModal] = useState(false)

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
            onClick={() => (embeddedInNav ? onCloseNav?.() : router.push('/'))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', color: '#111827', gap: 2 }}
            title={embeddedInNav ? '收起聊天' : '返回'}
          >
            <IconChevronLeft />
            {embeddedInNav && <span style={{ fontSize: 13, fontWeight: 700 }}>收起</span>}
          </button>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
            媽咪 (NightMaMa AI)
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#111827' }}>
          {/* Anxiety Report Quick Trigger Button */}
          <button
            onClick={() => setShowAnxietyModal(true)}
            style={{
              background: '#DC2626', color: '#FFFFFF', border: 'none',
              borderRadius: 16, padding: '4px 10px', fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(220,38,38,0.35)'
            }}
          >
            <IconAlertTriangle size={12} color="#FFFFFF" /> 不安通報
          </button>
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
        position: 'fixed', bottom: 72, left: 0, right: 0,
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
            onClick={() => sendMsg(':)')}
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
                  <IconMessageCircle size={16} color="#06C755" /> LINE 語音來電…
                </div>
              </div>

              <div style={{ display: 'flex', gap: 60, alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <button onClick={endVoiceCall} style={{ width: 72, height: 72, borderRadius: '50%', background: '#EF4444', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 16px rgba(239,68,68,0.5)' }}><IconPhoneOff size={32} color="white" /></button>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>拒絕</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <button onClick={acceptVoiceCall} style={{ width: 72, height: 72, borderRadius: '50%', background: '#06C755', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 16px rgba(6,199,85,0.5)' }}><IconPhoneCall size={32} color="white" /></button>
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
                    <span style={{ position: 'absolute', bottom: 0, right: 0, background: '#06C755', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <IconVolume2 size={11} color="white" /> 講話中
                    </span>
                  )}
                  {userSpeaking && (
                    <span style={{ position: 'absolute', bottom: 0, right: 0, background: '#8B5CF6', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <IconMic size={11} color="white" /> 聆聽中
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
                    border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    boxShadow: '0 4px 20px rgba(239,68,68,0.6)', transition: 'transform 0.15s ease'
                  }}
                  title="掛斷通話"
                >
                  <IconPhoneOff size={28} color="white" />
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

      {/* Anxiety Report Modal */}
      {/* AI 判斷需要求救時的倒數確認。不直接送出：模型可能誤判；
          也不要求按確認：真的遇到危險時太慢。倒數＋可取消是折衷。 */}
      {pendingAlert && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(8,11,20,0.92)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 380, background: '#111827', borderRadius: 22,
            padding: '26px 22px', textAlign: 'center',
            border: '1px solid rgba(239,68,68,0.5)', color: '#fff',
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🚨</div>
            <div style={{ fontSize: 19, fontWeight: 900, color: '#ef4444', marginBottom: 8 }}>
              即將通知緊急聯絡人
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.75)', marginBottom: 4 }}>
              {pendingAlert.reason}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 18 }}>
              {pendingAlert.location ? '將附上你的即時位置' : '定位失敗，訊息不會附上位置'}
            </div>

            <div style={{
              width: 92, height: 92, borderRadius: '50%', margin: '0 auto 18px',
              background: 'rgba(239,68,68,0.15)', border: '3px solid #ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 38, fontWeight: 900, color: '#ef4444',
            }}>
              {alertCountdown}
            </div>

            <button
              onClick={() => { setPendingAlert(null); setAlertResult(null) }}
              style={{
                width: '100%', padding: '13px', borderRadius: 14, cursor: 'pointer',
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff', fontSize: 15, fontWeight: 800,
              }}
            >
              我沒事，取消發送
            </button>
          </div>
        </div>
      )}

      {/* 求救送出結果 */}
      {alertResult && (
        <div style={{
          position: 'fixed', left: 16, right: 16, bottom: 90, zIndex: 500,
          borderRadius: 14, padding: '12px 16px', fontSize: 13, lineHeight: 1.6, fontWeight: 700,
          background: alertResult.ok ? 'rgba(16,185,129,0.95)' : 'rgba(245,158,11,0.95)',
          color: '#fff', boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
        }} onClick={() => setAlertResult(null)}>
          {alertResult.ok ? '✅ ' : '⚠️ '}{alertResult.text}
        </div>
      )}

      <AnxietyReportModal
        isOpen={showAnxietyModal}
        onClose={() => setShowAnxietyModal(false)}
        onReportSuccess={(category) => {
          setMessages(prev => [
            ...prev,
            {
              role: 'system',
              text: `[不安通報已發送] 分類：${category}。已同步 LINE 警訊給緊急聯絡人！`,
              timestamp: Date.now(),
            },
          ])
        }}
      />
      {!embeddedInNav && <NavBar active="companion" />}
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
