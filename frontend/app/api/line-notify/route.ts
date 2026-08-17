import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { token = '', targetId = '', message = '' } = await req.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const systemToken = 'TZ/d442Cywnnmeqs7ESSat2bq5URAytEdTSTtsBvHVxo9XypO6vg9n3q3z76hbThZ2Bf7QUPeR/lPbUukBrzne/Q+P+3SbThY3fRzVs5+wsb3O5n38ao6mmsywkxoFwF8fHkNv0tb0ERgOVEy8uHYQdB04t89/1O/w1cDnyilFU='
    const cleanToken = (token.trim() || process.env.LINE_CHANNEL_ACCESS_TOKEN || systemToken).trim()

    // 1. Try LINE Messaging API Push Message if targetId starts with 'U' (valid User ID)
    if (targetId && targetId.trim().startsWith('U')) {
      try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cleanToken}`,
          },
          body: JSON.stringify({
            to: targetId.trim(),
            messages: [{ type: 'text', text: message }],
          }),
        })

        if (res.ok) {
          return NextResponse.json({ success: true, mode: 'MessagingAPI-Push' })
        }
      } catch (err) {
        console.warn('LINE Messaging API Push failed, falling back to Broadcast:', err)
      }
    }

    // 2. Default: Broadcast via NightMama Official Account (https://api.line.me/v2/bot/message/broadcast)
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanToken}`,
        },
        body: JSON.stringify({
          messages: [{ type: 'text', text: message }],
        }),
      })

      if (res.ok) {
        return NextResponse.json({ success: true, mode: 'MessagingAPI-Broadcast' })
      }
    } catch (err) {
      console.warn('LINE Messaging API Broadcast failed:', err)
    }

    // 3. Fallback to LINE Notify REST API (Legacy support)
    const formData = new URLSearchParams()
    formData.append('message', message)
    const resNotify = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    const data = await resNotify.json()
    if (resNotify.ok) {
      return NextResponse.json({ success: true, mode: 'LINE-Notify' })
    } else {
      return NextResponse.json({ error: data.message || 'LINE 訊息發送失敗' }, { status: resNotify.status })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to send notification' }, { status: 500 })
  }
}
