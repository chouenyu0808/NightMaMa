import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NightMaMa — 夜間安全導航',
  description: '基於 AI 的夜間安全路線規劃，整合路燈密度、監視器分佈與語音陪伴，守護您的每一步',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NightMaMa',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0e1a',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=Inter:wght@400;500;700;900&display=swap" rel="stylesheet" />
      </head>
      <body style={{ background: '#0a0e1a' }}>
        {children}
      </body>
    </html>
  )
}
