import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { token, message } = await req.json()

  if (!token || !message) {
    return NextResponse.json({ error: 'token and message required' }, { status: 400 })
  }

  try {
    const formData = new URLSearchParams()
    formData.append('message', message)

    const res = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    const data = await res.json()
    if (res.ok) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ error: data.message }, { status: res.status })
    }
  } catch (e) {
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
