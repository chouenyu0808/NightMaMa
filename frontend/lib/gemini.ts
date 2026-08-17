/**
 * Gemini AI 語音陪聊工具
 */
import { GoogleGenerativeAI } from '@google/generative-ai'

let genAI: GoogleGenerativeAI | null = null

export function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_KEY!)
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
  const model = getGenAI().getGenerativeModel({ model: 'gemini-2.0-flash' })

  const contextText = `
【目前路線資訊】
出發地：${context.origin}
目的地：${context.destination}
安全評分：${context.safetyScore}/100
剩餘時間：約 ${context.durationMin} 分鐘
附近安全地標：${context.nearbyPlaces.join('、') || '搜尋中'}
${context.currentStep ? `目前步驟：${context.currentStep}` : ''}
`

  const chat = model.startChat({
    history: [
      {
        role: 'user',
        parts: [{ text: SYSTEM_PROMPT + '\n' + contextText }],
      },
      {
        role: 'model',
        parts: [{ text: '好的，我是 NightMaMa，現在陪著你一起走。有任何問題都可以問我！' }],
      },
      ...history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    ],
  })

  const result = await chat.sendMessage(userMessage)
  return result.response.text()
}

/** 路線評分說明（用 Gemini 生成自然語言） */
export async function generateRouteDescription(
  routeType: '最安全' | '最快' | '平衡',
  safetyScore: number,
  durationMin: number,
  lightCount: number,
  cctvCount: number,
  extraMin: number
): Promise<string> {
  const model = getGenAI().getGenerativeModel({ model: 'gemini-2.0-flash' })

  const prompt = `用一句話（25字內）描述這條步行路線，台灣繁體中文，語氣要讓夜間獨行者感到安心：
路線類型：${routeType}路線
安全評分：${safetyScore}/100
步行時間：${durationMin}分鐘
沿途路燈：${lightCount}盞
監視器：${cctvCount}支
${extraMin > 0 ? `比最快路線多 ${extraMin} 分鐘` : '這是最快的路線'}
只輸出一句話描述，不要加任何標點之外的格式。`

  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}
