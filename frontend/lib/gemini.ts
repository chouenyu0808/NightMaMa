/**
 * Gemini AI 語音陪聊工具
 *
 * 用 Interactions API（client.interactions.create）而不是舊版 generateContent —
 * gemini-2.0-flash 已完全停用，@google/generative-ai 也是 Google 已棄用的舊 SDK。
 */
import { GoogleGenAI } from '@google/genai'

const MODEL = 'gemini-3.7-flash'

let genAI: GoogleGenAI | null = null

export function getGenAI(): GoogleGenAI {
  if (!genAI) {
    genAI = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_KEY! })
  }
  return genAI
}

export interface CompanionContext {
  origin: string
  destination: string
  safetyScore: number
  durationMin: number
  nearbyPlaces: string[]
  currentStep?: string
}

const SYSTEM_PROMPT = `你是 NightMaMa，一個夜間步行安全 AI 陪伴助理。你的角色是：
1. 用溫暖、關心的語氣陪伴獨自夜行的使用者
2. 提供路線安全資訊和即時鼓勵
3. 在使用者感到不安時，保持冷靜並提供實際建議
4. 隨時提醒附近的安全地標（超商、警察局等）
5. 如偵測到使用者語氣急促或不安，主動詢問是否需要協助

語氣原則：
- 簡短有力（每次回應不超過 50 字）
- 像朋友而非機器
- 台灣繁體中文
- 不用「您」，用「你」

如果使用者說「SOS」或表達危險，立即回覆：「我聽到你了！請點擊下方紅色 SOS 按鈕，我會立刻通知你的緊急聯絡人。」`

/** 發送訊息給 Gemini，帶入路線上下文 */
export async function sendMessage(
  userMessage: string,
  history: Array<{ role: 'user' | 'model'; text: string }>,
  context: CompanionContext
): Promise<string> {
  const contextText = `
【目前路線資訊】
出發地：${context.origin}
目的地：${context.destination}
安全評分：${context.safetyScore}/100
剩餘時間：約 ${context.durationMin} 分鐘
附近安全地標：${context.nearbyPlaces.join('、') || '搜尋中'}
${context.currentStep ? `目前步驟：${context.currentStep}` : ''}
`

  const historyText = history
    .map((h) => `${h.role === 'user' ? '使用者' : 'NightMaMa'}：${h.text}`)
    .join('\n')

  const input = `${SYSTEM_PROMPT}\n${contextText}\n${historyText}\n使用者：${userMessage}\nNightMaMa：`

  const interaction = await getGenAI().interactions.create({ model: MODEL, input })
  return (interaction.output_text ?? '').trim()
}
