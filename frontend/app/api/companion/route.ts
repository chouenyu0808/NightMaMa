import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(req: NextRequest) {
  try {
    const { userMessage, history = [], context = {}, customApiKey = '' } = await req.json()

    if (!userMessage) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    const apiKey =
      customApiKey.trim() ||
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
      ''

    if (!apiKey) {
      return NextResponse.json({
        reply: '⚠️ 尚未設定 Gemini API Key！請在 .env.local 中設定 GEMINI_API_KEY=AIzaSy... 或至「⚙️ 設定」頁面貼上 Google AI Studio API Key。',
      })
    }

    const systemInstruction = `你是 NightMaMa，一個夜間步行安全 AI 陪伴助理。
任務與要求：
1. 繁體中文，用溫暖、貼心、有同理心且簡短自然的語氣回答（建議 25~45 字以內）。
2. 針對使用者的問題直接回答（如問晚餐吃什麼、問地點、問天氣、聊心情等，切勿扯無關的導航官話）。
3. 如使用者表達害怕或夜間危險，給予溫暖心理支持並提醒可隨時點擊 SOS。

【目前路線上下文】
- 出發地：${context.origin || '我的位置'}
- 目的地：${context.destination || '目的地'}
- 安全評分：${context.safetyScore || 85}/100
- 剩餘時間：約 ${context.durationMin || 5} 分鐘`

    const genAI = new GoogleGenerativeAI(apiKey)
    const modelsToTry = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-pro']
    let lastErrorMsg = ''

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction,
        })

        const formattedHistory = Array.isArray(history) && history.length > 0
          ? history.slice(-6).map(h => ({
              role: h.role === 'ai' || h.role === 'model' ? 'model' : 'user',
              parts: [{ text: h.text }],
            }))
          : []

        const chat = model.startChat({
          history: formattedHistory,
          generationConfig: {
            maxOutputTokens: 120,
            temperature: 0.7,
          },
        })

        const result = await chat.sendMessage(userMessage)
        const responseText = result.response.text()

        if (responseText && responseText.trim()) {
          return NextResponse.json({ reply: responseText.trim() })
        }
      } catch (err: any) {
        lastErrorMsg = err.message || String(err)
      }
    }

    return NextResponse.json({
      reply: `⚠️ Gemini SDK API 呼叫失敗：[${lastErrorMsg}]。請確認 API Key 是否有效 (需為 AIzaSy... 開頭之 Google AI Studio Key)。`,
    })
  } catch (e: any) {
    return NextResponse.json({
      reply: `⚠️ 伺服器處理錯誤：${e.message || '請稍後重試'}`,
    })
  }
}
