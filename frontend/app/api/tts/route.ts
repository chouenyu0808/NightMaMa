import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const text =
      body.text ||
      '喂～寶貝你走到哪裡啦？媽媽在客廳看電視等你喔！附近路燈有亮嗎？幫你留了熱湯，記得走大馬路快點回來喔！'
    const voiceName = body.voice || 'cmn-TW-Wavenet-A'
    const pitch = body.pitch || 1.0
    const speakingRate = body.speakingRate || 0.95

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
      ''

    // 1. Try official Google Cloud Text-to-Speech REST API (https://texttospeech.googleapis.com/v1/text:synthesize)
    if (apiKey) {
      try {
        const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode: 'cmn-TW', name: voiceName, ssmlGender: 'FEMALE' },
            audioConfig: { audioEncoding: 'MP3', pitch, speakingRate },
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
        console.warn('Google Cloud TTS API failed, falling back:', err)
      }
    }

    // 2. Fallback to Google Mandarin Neural Voice REST endpoint
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
