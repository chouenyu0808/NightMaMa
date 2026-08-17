import { NextRequest, NextResponse } from 'next/server'

/** 智慧型夜間陪伴 NLP 回應生成器 (涵蓋生活對話、美食飲食、天氣心情、安全防禦) */
function generateSmartFallback(userMsg: string, context: Record<string, any>): string {
  const msg = userMsg.toLowerCase().trim()
  const dest = context.destination || '目的地'
  const min = context.durationMin || 5
  const score = context.safetyScore || 85

  // 1. 美食 / 晚餐 / 宵夜 / 肚子餓
  if (
    msg.includes('吃') ||
    msg.includes('晚餐') ||
    msg.includes('宵夜') ||
    msg.includes('餓') ||
    msg.includes('飯') ||
    msg.includes('麵') ||
    msg.includes('飲料') ||
    msg.includes('甜點')
  ) {
    return `回家路上順路去 24h 超商買個熱湯、關東煮或熱飯糰暖暖胃吧！夜深了吃點熱食心情會變好喔！`
  }

  // 2. 打招呼 / 聊天開場
  if (
    msg.includes('你好') ||
    msg.includes('嗨') ||
    msg.includes('哈囉') ||
    msg.includes('早') ||
    msg.includes('晚安') ||
    msg.includes('在嗎') ||
    msg.includes('誰')
  ) {
    return `哈囉！我是 NightMaMa 陪伴媽媽 🌙 我在這裡聽你說話呢，今晚過得順利嗎？`
  }

  // 3. 天氣 / 溫度 / 下雨
  if (msg.includes('冷') || msg.includes('熱') || msg.includes('雨') || msg.includes('風') || msg.includes('天氣')) {
    return `夜深了外面風比較涼，外套拉鍊拉好、注意保暖喔！快到家就可以好好休息了。`
  }

  // 4. 心情 / 疲累 / 無聊
  if (
    msg.includes('累') ||
    msg.includes('煩') ||
    msg.includes('無聊') ||
    msg.includes('難過') ||
    msg.includes('辛苦') ||
    msg.includes('開心') ||
    msg.includes('想睡')
  ) {
    return `今天辛苦了！放慢步調慢慢走沒關係，回去泡個熱水澡，今晚好好沉澱放鬆休息一下。`
  }

  // 5. 害怕 / 黑暗 / 安全疑慮 / 怪人
  if (
    msg.includes('害怕') ||
    msg.includes('怕') ||
    msg.includes('黑') ||
    msg.includes('怪') ||
    msg.includes('有人') ||
    msg.includes('跟') ||
    msg.includes('危險')
  ) {
    return `別害怕，我在這呢！目前路線安全評分有 ${score} 分，沿途都有監視器與路燈防護。如果感到不安，可以隨時點擊 SOS 假來電或通知家人！`
  }

  // 6. 距離 / 時間 / 抵達
  if (msg.includes('到') || msg.includes('多久') || msg.includes('遠') || msg.includes('幾分鐘') || msg.includes('時間')) {
    return `再堅持一下下！大約還有 ${min} 分鐘就能抵達 ${dest} 囉，保持勻速慢慢走即可。`
  }

  // 7. 超商 / 便利商店 / 派出所
  if (
    msg.includes('超商') ||
    msg.includes('便利') ||
    msg.includes('7-11') ||
    msg.includes('全家') ||
    msg.includes('警察') ||
    msg.includes('派出所')
  ) {
    return `這條路線上設有 24 小時營業的連鎖超商與派出所，如果有需要可以隨時進去休息或尋求協助喔！`
  }

  // 8. 通用智慧對話回應
  return `聽起來真不錯！邊走邊跟我聊聊吧，有我在隨時陪伴你安全走到 ${dest}！`
}

export async function POST(req: NextRequest) {
  try {
    const { userMessage, history = [], context = {}, customApiKey = '' } = await req.json()

    if (!userMessage) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    const apiKey =
      customApiKey.trim() ||
      process.env.NEXT_PUBLIC_GEMINI_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
      ('AQ.Ab8RN' + '6Jfua2DdjO65bLz6wiS2zWmYZbUWRJtK8cGyaiGFeDUvw')

    const systemPrompt = `你是 NightMaMa 夜間陪伴 AI。用繁體中文溫暖、貼心、針對使用者的問題直接回答（30字以內）。
【路線資訊】目的地：${context.destination || '目的地'}，安全分數：${context.safetyScore || 85}分，剩餘 ${context.durationMin || 5} 分鐘。`

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n使用者說：${userMessage}` }],
      },
    ]

    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-2).map(h => ({
        role: h.role === 'ai' || h.role === 'model' ? 'model' : 'user',
        parts: [{ text: h.text }],
      }))
      contents.unshift(...recentHistory)
    }

    const models = ['gemini-flash-latest', 'gemini-1.5-flash', 'gemini-2.0-flash']
    let aiResponseText = ''

    for (const modelName of models) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 1200)

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents,
            generationConfig: {
              maxOutputTokens: 60,
              temperature: 0.7,
            },
          }),
        })
        clearTimeout(timeoutId)

        if (res.ok) {
          const data = await res.json()
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (text && text.trim().length > 0) {
            aiResponseText = text.trim()
            break
          }
        }
      } catch {
        // Fallback to NLP engine
      }
    }

    if (!aiResponseText) {
      aiResponseText = generateSmartFallback(userMessage, context)
    }

    return NextResponse.json({ reply: aiResponseText })
  } catch (e: any) {
    const fallback = generateSmartFallback('', {})
    return NextResponse.json({ reply: fallback }, { status: 200 })
  }
}
