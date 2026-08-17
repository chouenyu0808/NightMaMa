/**
 * Gemini AI 語音陪聊工具 (呼叫 /api/companion 端點存取 Gemini 3.6 Flash)
 */

export interface CompanionContext {
  origin: string
  destination: string
  safetyScore: number
  durationMin: number
  nearbyPlaces: string[]
  currentStep?: string
}

/** 發送訊息或照片給 Gemini Flash API */
export async function sendMessage(
  userMessage: string,
  history: Array<{ role: 'user' | 'model'; text: string }>,
  context: CompanionContext,
  imageData?: string
): Promise<string> {
  try {
    const customApiKey = typeof window !== 'undefined' ? localStorage.getItem('nightmama_gemini_key') || '' : ''
    const res = await fetch('/api/companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage, history, context, customApiKey, imageData }),
    })

    const data = await res.json()
    if (data.reply) return data.reply
  } catch (e) {
    console.error('Gemini companion request failed:', e)
  }

  return '我在這裡陪著你喔！請放心往前走。'
}

/** 路線評分說明（自然語言描述） */
export async function generateRouteDescription(
  routeType: '最安全' | '最快' | '平衡',
  safetyScore: number,
  durationMin: number,
  lightCount: number,
  cctvCount: number,
  extraMin: number
): Promise<string> {
  if (routeType === '最安全') {
    return `🛡️ 安全評分 ${safetyScore} 分，沿途 ${lightCount} 盞路燈與 ${cctvCount} 支監視器密集守護`
  } else if (routeType === '最快') {
    return `⚡ 最快抵達路線，步行約 ${durationMin} 分鐘，沿途有 ${lightCount} 盞路燈`
  }
  return `⚖️ 平衡路線，約 ${durationMin} 分鐘，沿途經過 ${lightCount} 盞路燈與超商`
}
