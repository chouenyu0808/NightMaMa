import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const text =
      body.text ||
      '喂～寶貝你走到哪裡啦？媽媽在客廳看電視等你喔！附近路燈有亮嗎？幫你留了熱湯，記得走大馬路快點回來喔！'
    const prompt = body.prompt || 'Read aloud in a warm, welcoming tone.'
    const voiceName = body.voice || 'Achernar'
    const modelName = body.modelName || 'gemini-3.1-flash-tts-preview'
    const languageCode = body.languageCode || 'cmn-tw'

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
      ''

    // 1. Exact Gemini 3.1 Flash TTS Preview REST API payload from official Google Cloud Console
    if (apiKey) {
      try {
        const res = await fetch(`https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioConfig: {
              audioEncoding: 'MP3',
              pitch: 0,
              speakingRate: 1,
            },
            input: {
              prompt,
              text,
            },
            voice: {
              languageCode,
              modelName,
              name: voiceName,
            },
          }),
        })

        if (res.ok) {
          const data = await res.json()
          if (data.audioContent) {
            const buffer = Buffer.from(data.audioContent, 'base64')
            return new NextResponse(buffer, {
              headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=86400',
              },
            })
          }
        }
      } catch (err) {
        console.warn('Gemini 3.1 Flash TTS Preview API failed, falling back:', err)
      }
    }

    // 2. High-quality Taiwan Mandarin Voice Fallback
    const encodedText = encodeURIComponent(text)
    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=zh-TW&client=tw-ob`
    const resFallback = await fetch(googleUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    if (resFallback.ok) {
      const audioBuffer = await resFallback.arrayBuffer()
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400',
        },
      })
    }

    return NextResponse.json({ error: 'TTS Synthesis failed' }, { status: 500 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'TTS Error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const text =
    searchParams.get('text') ||
    '喂～寶貝你走到哪裡啦？媽媽在客廳看電視等你喔！附近路燈有亮嗎？幫你留了熱湯，記得走大馬路快點回來喔！'
  return POST(new NextRequest(req.url, { method: 'POST', body: JSON.stringify({ text }) }))
}
