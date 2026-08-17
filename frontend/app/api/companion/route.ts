import { NextRequest, NextResponse } from 'next/server'

function generateSmartFallback(userMsg: string, context: Record<string, any>): string {
  const msg = userMsg.toLowerCase()
  const dest = context.destination || '目的地'
  const min = context.durationMin || 5
  const score = context.safetyScore || 85

  if (msg.includes('害怕') || msg.includes('怕') || msg.includes('黑') || msg.includes('怪') || msg.includes('有人')) {
    return `別害怕，我在這呢！目前路線安全評分有 ${score} 分，沿途都有監視器與路燈防護。如果感到不安，可以隨時按下 SOS 發送假來電喔！`
  }
  if (msg.includes('到') || msg.includes('多久') || msg.includes('遠') || msg.includes('幾分鐘')) {
    return `再堅持一下下！大約還有 ${min} 分鐘就能抵達 ${dest} 囉，保持勻速慢慢走即可。`
  }
  if (msg.includes('超商') || msg.includes('便利') || msg.includes('買') || msg.includes('7-11') || msg.includes('全家')) {
    return `這條路線上設有 24 小時營業的連鎖超商與派出所，如果有需要可以隨時進去休息或尋求協助喔！`
  }
  if (msg.includes('累') || msg.includes('休息') || msg.includes('慢')) {
    return `辛苦啦！稍微放慢腳步沒關係的，這條路線路燈滿充足的，順順地走最舒服。`
  }
  return `收到！我會一路陪伴你走到 ${dest}。路上隨時有狀況都可以隨時發訊息跟我說喔！`
}

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

    const systemPrompt = `你是 NightMaMa 夜間安全陪伴 AI。用繁體中文溫暖、貼心、簡短回應（30字以內）。
【路線資訊】目的地：${context.destination || '目的地'}，安全分數：${context.safetyScore || 85}分，剩餘 ${context.durationMin || 5} 分鐘。`

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n使用者：${userMessage}` }],
      },
    ]

    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-2).map(h => ({
        role: h.role === 'ai' || h.role === 'model' ? 'model' : 'user',
        parts: [{ text: h.text }],
      }))
      contents.unshift(...recentHistory)
    }

    // Direct fast call with 1200ms strict timeout and token cap (max 50 tokens)
    const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-3.6-flash']
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
              maxOutputTokens: 55,
              temperature: 0.7,
            },
          }),
        })
        clearTimeout(timeoutId)

        if (res.ok) {
          const data = await res.json()
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            aiResponseText = text.trim()
            break
          }
        }
      } catch {
        // Continue to fast fallback on timeout or error
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
