import { NextRequest, NextResponse } from 'next/server'

// 依序嘗試，第一個成功回應的就採用。
// 注意：gemini-1.5-flash 已從 Gemini API 下線，不要再放回這個清單。
const CHAT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']
const VISION_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']

export async function POST(req: NextRequest) {
  try {
    const { userMessage, history = [], context = {}, imageData = '' } = await req.json()

    if (!userMessage && !imageData) {
      return NextResponse.json({ error: 'Message or image required' }, { status: 400 })
    }

    // 僅伺服器端環境變數。不要 fallback 到 NEXT_PUBLIC_ 版本（會外洩到瀏覽器），
    // 也不要拿 Maps key 當 Gemini key 用（兩個服務混用同一把金鑰）。
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('[companion] 缺少 GEMINI_API_KEY 環境變數')
      return NextResponse.json({
        reply: '⚠️ AI 陪伴服務尚未設定，請確認伺服器已設定 GEMINI_API_KEY。',
      })
    }

    let lastError = ''

    // Build prompt for Gemini
    const systemInstruction = `你是「媽咪」，一個夜間步行陪伴好媽媽、好朋友。
【重要回應格式與長度規則】
1. 模擬真實人類傳 LINE 簡訊習慣：每次回應【嚴格限制在 1 ~ 2 句短句（20 ~ 45 字以內）】，切勿長篇大論，絕對不要使用點狀條列式清單（如 1. 2. 3.）。
2. 使用繁體中文，語氣溫暖親切、像媽媽/好友邊走邊關心傳訊息。
3. 針對使用者的問題或上傳的照片直接簡短回答（如問晚餐吃什麼、照片風險分析等）。
4. 如使用者表達害怕，給予簡短溫暖關懷，並提醒可隨時點擊 SOS。

【目前路線上下文】
- 出發地：${context.origin || '我的位置'}
- 目的地：${context.destination || '目的地'}
- 安全評分：${typeof context.safetyScore === 'number' ? `${context.safetyScore}/100` : '尚未取得（請勿自行編造分數）'}
- 剩餘時間：約 ${context.durationMin || 5} 分鐘`

    // Multimodal Photo Inspection Branch
    if (imageData && imageData.startsWith('data:image')) {
      const cleanBase64 = imageData.replace(/^data:image\/\w+;base64,/, '')

      for (const modelName of VISION_MODELS) {
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
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err)
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

    // 先前這裡會先打 /v1beta/interactions 搭配 model "gemini-3.6-flash"。
    // 這個端點與這個 model 名稱在 Gemini API 都不存在，所以每次對話都固定失敗一次
    // 才會 fallback，白白多付一個來回的延遲。已移除，直接使用 generateContent。
    for (const modelName of CHAT_MODELS) {
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
        } else {
          const errData = await res.json().catch(() => ({}))
          lastError = `[${modelName} HTTP ${res.status}] ${errData.error?.message || ''}`
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.warn(`generateContent model ${modelName} failed:`, err)
      }
    }

    return NextResponse.json({
      reply: `⚠️ Gemini AI 連線失敗 (${lastError || '無回應'})。請確認 GCP Cloud Run 環境變數已正確設定 GEMINI_API_KEY。`,
    })
  } catch (e) {
    // 內部錯誤細節只寫進伺服器日誌，不要回傳給用戶端
    console.error('[companion] 未預期的錯誤', e)
    return NextResponse.json({
      reply: '⚠️ 伺服器處理錯誤，請稍後重試。',
    })
  }
}
