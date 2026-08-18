import { NextRequest, NextResponse } from 'next/server'
import { COMPANION_TOOLS_PAYLOAD } from '@/lib/companionTools'

// 依序嘗試，第一個成功回應的就採用。
//
// 這個清單踩過兩次雷：gemini-1.5-flash、gemini-2.0-flash、gemini-2.5-flash
// 都先後被 Google 下線，程式就直接回 404 停擺。寫死版號的模型遲早會退役。
//
// 因此最後一項固定放 gemini-flash-latest —— 那是會自動指向當前最新
// flash 模型的別名，不會 404。前面的明確版號負責行為可預期，
// 別名負責在它退役時讓服務自己續命，不必等人改程式碼。
//
// 想確認目前有哪些模型可用：
//   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
const CHAT_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest']
const VISION_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest']

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

    // 即時座標讓 AI 知道使用者「現在在哪」，而不只是起訖點名稱。
    // 先前完全沒傳，AI 對位置一無所知。
    const loc = context.location
    const locationLine =
      loc && typeof loc.lat === 'number' && typeof loc.lng === 'number'
        ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`
        : '尚未取得定位'

    // Build prompt for Gemini
    const systemInstruction = `你是「媽咪」，一個夜間步行陪伴好媽媽、好朋友。
【重要回應格式與長度規則】
1. 模擬真實人類傳 LINE 簡訊習慣：每次回應【嚴格限制在 1 ~ 2 句短句（20 ~ 45 字以內）】，切勿長篇大論，絕對不要使用點狀條列式清單（如 1. 2. 3.）。
2. 使用繁體中文，語氣溫暖親切、像媽媽/好友邊走邊關心傳訊息。
3. 針對使用者的問題或上傳的照片直接簡短回答（如問晚餐吃什麼、照片風險分析等）。
4. 如使用者表達害怕，給予簡短溫暖關懷，並提醒可隨時點擊 SOS。

【判讀使用者情緒】
從對話語氣判斷對方的狀態（放鬆／有點緊張／害怕／恐慌），並據此調整回應與行動：
- 放鬆：正常閒聊即可。
- 有點緊張：溫暖安撫，必要時主動提議帶他走亮一點的路。
- 害怕：先安撫，並呼叫 find_lit_road_now 立刻帶他走大馬路。
- 明確描述人身威脅（有人跟蹤、有人抓我、快報警）：立刻呼叫 trigger_emergency_alert。
不要問「你要不要我幫你？」就停住 —— 該行動時直接呼叫對應的工具，再用一句話告訴他你做了什麼。

【可用工具】
你可以實際規劃路線與發出求救，不是只能用講的。需要時直接呼叫對應函式。

【目前路線上下文】
- 出發地：${context.origin || '我的位置'}
- 目的地：${context.destination || '目的地'}
- 安全評分：${typeof context.safetyScore === 'number' ? `${context.safetyScore}/100` : '尚未取得（請勿自行編造分數）'}
- 剩餘時間：約 ${context.durationMin || 5} 分鐘
- 目前位置：${locationLine}`

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

    // 先前這裡會先打 /v1beta/interactions 再 fallback 到 generateContent。
    // 那個端點不存在（模型名稱本身沒問題），所以每次對話都固定先失敗一次，
    // 白白多付一個來回的延遲。已移除，直接使用 generateContent。
    for (const modelName of CHAT_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            tools: COMPANION_TOOLS_PAYLOAD,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          const parts = data.candidates?.[0]?.content?.parts ?? []

          // 模型決定要行動時會回 functionCall。實際執行需要瀏覽器端的
          // GPS、地理編碼與導航，所以這裡把它原樣交還給前端執行。
          const call = parts.find((p: { functionCall?: unknown }) => p.functionCall)?.functionCall
          if (call?.name) {
            const spoken = parts.map((p: { text?: string }) => p.text ?? '').join('').trim()
            return NextResponse.json({
              reply: spoken,
              action: { name: call.name, args: call.args ?? {} },
            })
          }

          const text = parts.map((p: { text?: string }) => p.text ?? '').join('').trim()
          if (text) {
            return NextResponse.json({ reply: text })
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
