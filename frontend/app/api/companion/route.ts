import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { userMessage, history = [], context = {}, imageData = '' } = await req.json()

    if (!userMessage && !imageData) {
      return NextResponse.json({ error: 'Message or image required' }, { status: 400 })
    }

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
      ''

    let lastError = ''

    // Build prompt for Gemini
    const systemInstruction = `你是 NightMaMa，一個夜間步行陪伴好朋友。
【重要回應格式與長度規則】
1. 模擬真實人類傳 LINE 簡訊習慣：每次回應【嚴格限制在 1 ~ 2 句短句（20 ~ 45 字以內）】，切勿長篇大論，絕對不要使用點狀條列式清單（如 1. 2. 3.）。
2. 使用繁體中文，語氣親切自然、溫暖、像朋友邊走邊輕鬆傳訊息。
3. 針對使用者的問題或上傳的照片直接簡短回答（如問晚餐吃什麼、照片風險分析等）。
4. 如使用者表達害怕，給予簡短溫暖關懷，並提醒可隨時點擊 SOS。

【目前路線上下文】
- 出發地：${context.origin || '我的位置'}
- 目的地：${context.destination || '目的地'}
- 安全評分：${context.safetyScore || 85}/100
- 剩餘時間：約 ${context.durationMin || 5} 分鐘`

    // Multimodal Photo Inspection Branch
    if (imageData && imageData.startsWith('data:image')) {
      const cleanBase64 = imageData.replace(/^data:image\/\w+;base64,/, '')
      const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash']

      for (const modelName of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `${systemInstruction}\n使用者上傳了一張夜間路口/巷弄的照片。請實時分析現場照明與危險等級，給予簡短 2 句內的避險建議！`,
                    },
                    {
                      inlineData: {
                        mimeType: 'image/jpeg',
                        data: cleanBase64,
                      },
                    },
                  ],
                },
              ],
            }),
          })

          if (res.ok) {
            const data = await res.json()
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text
            if (text && text.trim()) {
              return NextResponse.json({ reply: `📸 照片分析完成：${text.trim()}` })
            }
          }
        } catch (err: any) {
          lastError = err.message || String(err)
        }
      }
    }

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
      } else {
        const errData = await res.json().catch(() => ({}))
        lastError = `[Interactions HTTP ${res.status}] ${errData.error?.message || ''}`
      }
    } catch (err: any) {
      lastError = err.message || String(err)
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
      reply: `⚠️ Gemini AI 連線失敗 (${lastError || '無回應'})。請確認 GCP Cloud Run 環境變數已正確設定 GEMINI_API_KEY。`,
    })
  } catch (e: any) {
    return NextResponse.json({
      reply: `⚠️ 伺服器處理錯誤：${e.message || '請稍後重試'}`,
    })
  }
}
