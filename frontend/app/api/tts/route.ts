import { NextRequest, NextResponse } from 'next/server'

/**
 * Gemini TTS API route - uses generativelanguage.googleapis.com/generateContent
 * NOT texttospeech.googleapis.com (that endpoint requires separate Cloud TTS billing).
 *
 * The Gemini TTS model returns raw PCM audio (24kHz, 16-bit, mono).
 * We wrap it with a WAV header so browsers can play it natively.
 */

function buildWavHeader(pcmDataLength: number, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = sampleRate * numChannels * bitsPerSample / 8
  const blockAlign = numChannels * bitsPerSample / 8
  const header = Buffer.alloc(44)

  header.write('RIFF', 0)                          // ChunkID
  header.writeUInt32LE(36 + pcmDataLength, 4)      // ChunkSize
  header.write('WAVE', 8)                          // Format
  header.write('fmt ', 12)                         // Subchunk1ID
  header.writeUInt32LE(16, 16)                     // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20)                      // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22)            // NumChannels
  header.writeUInt32LE(sampleRate, 24)             // SampleRate
  header.writeUInt32LE(byteRate, 28)               // ByteRate
  header.writeUInt16LE(blockAlign, 32)             // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34)          // BitsPerSample
  header.write('data', 36)                         // Subchunk2ID
  header.writeUInt32LE(pcmDataLength, 40)          // Subchunk2Size

  return header
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const text =
      body.text ||
      '喂～寶貝你走到哪裡啦？媽媽在客廳看電視等你喔！附近路燈有亮嗎？幫你留了熱湯，記得走大馬路快點回來喔！'
    const voiceName = body.voice || 'Aoede'

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_KEY ||
      ''

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing Gemini API key' }, { status: 500 })
    }

    // Gemini TTS: POST generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`

    const prompt = `用溫暖親切的台灣媽媽口吻說：${text}`

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: prompt }],
        }],
        generation_config: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: voiceName,
              },
            },
          },
        },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Gemini TTS error:', res.status, errText)
      return NextResponse.json({ error: `Gemini TTS API error: ${res.status}` }, { status: 500 })
    }

    const data = await res.json()
    const candidates = data.candidates || []
    if (candidates.length > 0) {
      const parts = candidates[0]?.content?.parts || []
      for (const part of parts) {
        const inlineData = part.inlineData
        if (inlineData?.data) {
          const rawPcm = Buffer.from(inlineData.data, 'base64')
          const wavHeader = buildWavHeader(rawPcm.length)
          const wavBuffer = Buffer.concat([wavHeader, rawPcm])

          return new NextResponse(wavBuffer, {
            headers: {
              'Content-Type': 'audio/wav',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }
      }
    }

    return NextResponse.json({ error: 'No audio in Gemini TTS response' }, { status: 500 })
  } catch (err: any) {
    console.error('TTS route error:', err)
    return NextResponse.json({ error: err.message || 'TTS Error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const text =
    searchParams.get('text') ||
    '喂～寶貝你走到哪裡啦？媽媽在客廳看電視等你喔！附近路燈有亮嗎？幫你留了熱湯，記得走大馬路快點回來喔！'
  const voice = searchParams.get('voice') || 'Aoede'
  return POST(new NextRequest(req.url, { method: 'POST', body: JSON.stringify({ text, voice }) }))
}
