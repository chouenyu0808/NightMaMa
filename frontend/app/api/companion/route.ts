import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { userMessage, history = [], context = {} } = await req.json()

    if (!userMessage) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
      ''

    // Build prompt for Gemini 3.6 Flash Interactions API
    const systemInstruction = `你是 NightMaMa，一個夜間步行安全 AI 陪伴助理。
任務與要求：
1. 請用繁體中文，以溫暖、親切、自然且具同理心的語氣回答使用者的問題。
2. 針對使用者的問題直接且正面回答（例如問晚餐吃什麼、聊天氣、聊心情、問地點等）。
3. 使用者表達害怕或夜間危險時，給予溫暖心理支持並提醒可點擊 SOS。

【目前路線上下文】
- 出發地：${context.origin || '我的位置'}
- 目的地：${context.destination || '目的地'}
- 安全評分：${context.safetyScore || 85}/100
- 剩餘時間：約 ${context.durationMin || 5} 分鐘
`

    let historyText = ''
    if (Array.isArray(history) && history.length > 0) {
      const recent = history.slice(-4)
      historyText = recent.map(h => `${h.role === 'user' ? '使用者' : 'NightMaMa'}：${h.text}`).join('\n')
      historyText = `\n【最近對話紀錄】\n${historyText}\n`
    }

    const fullPrompt = `${systemInstruction}${historyText}\n使用者問：${userMessage}`

    // 1. Try Gemini Interactions API (gemini-3.6-flash)
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model: 'gemini-3.6-flash',
          input: fullPrompt,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const modelOutputStep = data.steps?.find((s: any) => s.type === 'model_output')
        const replyText = modelOutputStep?.content?.[0]?.text || data.output_text

        if (replyText && replyText.trim()) {
          return NextResponse.json({ reply: replyText.trim() })
        }
      }
    } catch (err) {
      console.warn('Interactions API fetch failed, falling back to generateContent:', err)
    }

    // 2. Fallback to generateContent REST API
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash']
    for (const modelName of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          }),
        })

        if (res.ok) {
          const data = await res.json()
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (text && text.trim()) {
            return NextResponse.json({ reply: text.trim() })
          }
        }
      } catch (err) {
        console.warn(`generateContent model ${modelName} failed:`, err)
      }
    }

    return NextResponse.json({
      reply: '我在這裡陪伴著你喔！請放心繼續往前走，有任何狀況都可以隨時告訴我！',
    })
  } catch (e: any) {
    return NextResponse.json({
      reply: `⚠️ 伺服器處理錯誤：${e.message || '請稍後重試'}`,
    })
  }
}
