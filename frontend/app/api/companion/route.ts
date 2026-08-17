import { NextRequest, NextResponse } from 'next/server'

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
      ''

    if (!apiKey) {
      return NextResponse.json({
        reply: '⚠️ 尚未設定 Gemini API Key！請至「⚙️ 設定」頁面填入有效的 Google AI Studio Key (AIzaSy...)。'
      })
    }

    const systemPrompt = `你是 NightMaMa 夜間陪伴 AI 助理。請用繁體中文以溫暖、自然、同理心且直接回答使用者的問題。
【路線上下文】
- 出發地：${context.origin || '我的位置'}
- 目的地：${context.destination || '目的地'}
- 路線安全分數：${context.safetyScore || 85}/100
- 剩餘時間：約 ${context.durationMin || 5} 分鐘
`

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n使用者問：${userMessage}` }],
      },
    ]

    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-4).map(h => ({
        role: h.role === 'ai' || h.role === 'model' ? 'model' : 'user',
        parts: [{ text: h.text }],
      }))
      contents.unshift(...recentHistory)
    }

    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest']
    let lastErrorMsg = ''

    for (const modelName of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              maxOutputTokens: 120,
              temperature: 0.7,
            },
          }),
        })

        const data = await res.json()
        if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          const reply = data.candidates[0].content.parts[0].text.trim()
          return NextResponse.json({ reply })
        } else if (data.error?.message) {
          lastErrorMsg = `[${res.status}] ${data.error.message}`
        }
      } catch (err: any) {
        lastErrorMsg = err.message || '連線逾時'
      }
    }

    // Direct error reporting if Gemini API calls fail
    return NextResponse.json({
      reply: `⚠️ Gemini API 呼叫失敗：${lastErrorMsg || '請至設定頁確認 Gemini API Key 是否正確。'}`
    })
  } catch (e: any) {
    return NextResponse.json(
      { reply: `⚠️ 伺服器處理錯誤：${e.message || '請稍後重試'}` },
      { status: 200 }
    )
  }
}
