import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const text = searchParams.get('text') || '喂～寶貝你走到哪裡啦？媽媽在客廳看電視等你喔！附近路燈有亮嗎？幫你留了熱湯，記得走大馬路快點回來喔！'

  try {
    const encodedText = encodeURIComponent(text)
    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=zh-TW&client=tw-ob`

    const res = await fetch(googleUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    if (!res.ok) {
      throw new Error(`Google TTS returned ${res.status}`)
    }

    const audioBuffer = await res.arrayBuffer()
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'TTS Error' }, { status: 500 })
  }
}
