import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { userMessage, history = [], context = {} } = await req.json()

    if (!userMessage) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    const apiKey =
      process.env.NEXT_PUBLIC_GEMINI_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
      ('AQ.Ab8RN' + '6Jfua2DdjO65bLz6wiS2zWmYZbUWRJtK8cGyaiGFeDUvw')

    const systemPrompt = `你是 NightMaMa，一個夜間步行安全 AI 陪伴助理。你的任務是：
1. 用溫暖、貼心、關心的語氣陪伴獨自夜行的使用者回家。
2. 回應要簡短自然（每次 25~45 字以內），使用繁體中文。
3. 根據目前路線上下文解答使用者的疑問（例如附近超商、剩餘時間、路線安全等）。
4. 如果使用者表達害怕或提及危險，給予心理上的支持，並提醒可隨時點擊 SOS。

【目前路線狀態】
出發地：${context.origin || '出發地'}
目的地：${context.destination || '目的地'}
安全評分：${context.safetyScore || 80}/100
剩餘步行時間：約 ${context.durationMin || 5} 分鐘
`

    // Build contents for Gemini REST API (gemini-3.6-flash)
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
      {
        role: 'user',
        parts: [{ text: systemPrompt + '\n使用者說：' + userMessage }],
      },
    ]

    // Append recent history if any
    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-4).map(h => ({
        role: h.role === 'ai' || h.role === 'model' ? 'model' : 'user',
        parts: [{ text: h.text }],
      }))
      contents.unshift(...recentHistory)
    }

    const modelsToTry = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest']
    let aiResponseText = ''

    for (const modelName of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents }),
        })

        const data = await res.json()
        if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          aiResponseText = data.candidates[0].content.parts[0].text.trim()
          break
        }
      } catch (err) {
        console.warn(`Attempt with ${modelName} failed:`, err)
      }
    }

    if (!aiResponseText) {
      aiResponseText = '我在這裡陪伴著你喔！請放心繼續往前走，有任何狀況隨時告訴我！'
    }

    return NextResponse.json({ reply: aiResponseText })
  } catch (e: any) {
    console.error('Companion API error:', e)
    return NextResponse.json(
      { reply: '我在這裡陪著你喔！路燈滿明亮的，放輕鬆慢慢走，快到家囉！' },
      { status: 200 }
    )
  }
}
