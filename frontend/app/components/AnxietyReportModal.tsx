'use client'

import { useState } from 'react'
import { IconAlertTriangle, IconUser, IconBulb, IconVolume2, IconShield, IconX } from '@/components/Icons'
import { sendLineNotification } from '@/lib/emergencyContacts'
import { getUserId } from '@/lib/user'

interface AnxietyReportModalProps {
  isOpen: boolean
  onClose: () => void
  currentPos?: { lat: number; lng: number }
  onReportSuccess?: (category: string, lat: number, lng: number) => void
}

const CATEGORIES = [
  { id: 'follower', label: '疑似有人跟隨', icon: <IconUser size={18} color="#DC2626" />, desc: '感覺後方有可疑人士尾隨' },
  { id: 'dark', label: '路燈故障 / 巷弄極暗', icon: <IconBulb size={18} color="#F59E0B" />, desc: '現場視線不良、缺乏照明' },
  { id: 'noise', label: '異常聲響 / 可疑群聚', icon: <IconVolume2 size={18} color="#3B82F6" />, desc: '前方有吵鬧、醉漢或聚集' },
  { id: 'general', label: '感到不安 / 留存紀錄', icon: <IconShield size={18} color="#10B981" />, desc: '直覺不對勁，預防性報備' },
]

export default function AnxietyReportModal({
  isOpen,
  onClose,
  currentPos,
  onReportSuccess,
}: AnxietyReportModalProps) {
  const [loadingCategory, setLoadingCategory] = useState<string | null>(null)
  const [resultMsg, setResultMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!isOpen) return null

  const handleSelectCategory = async (categoryLabel: string) => {
    setLoadingCategory(categoryLabel)
    setResultMsg(null)

    // 1. Get current GPS position if not provided
    let lat = currentPos?.lat
    let lng = currentPos?.lng

    if (typeof window !== 'undefined' && navigator.geolocation && !currentPos) {
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            lat = pos.coords.latitude
            lng = pos.coords.longitude
            resolve()
          },
          () => resolve(),
          { timeout: 3000 }
        )
      })
    }

    // 定位失敗就不要用假座標硬送，通報一個錯誤的位置沒有意義
    if (lat === undefined || lng === undefined) {
      setResultMsg({ ok: false, text: '定位失敗，無法取得目前位置，通報未送出。請確認已允許位置權限。' })
      setLoadingCategory(null)
      return
    }

    const addressText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`

    // 2. Post to /api/report (Community Safety Heatmap)
    let reportOk = false
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, category: categoryLabel, address: addressText, user_id: getUserId() }),
      })
      reportOk = res.ok
    } catch {
      reportOk = false
    }

    // 3. Send LINE Alert Push Notification to the user's configured emergency contact
    const lineMessage = `⚠️ [NightMaMa 不安通報]\n使用者通報「${categoryLabel}」。\n📍 目前即時 GPS 位置：https://maps.google.com/?q=${lat},${lng}\n🤖 AI 媽咪正在線上語音陪伴中。`
    const notify = await sendLineNotification(lineMessage)

    // 據實回報兩件事各自的結果，不要一律顯示成功
    if (reportOk && notify.sent) {
      setResultMsg({ ok: true, text: '不安通報已記錄在安全地圖，並已發送 LINE 警訊給緊急聯絡人。' })
    } else if (reportOk) {
      setResultMsg({ ok: false, text: `通報已記錄在安全地圖，但 ${notify.message}` })
    } else if (notify.sent) {
      setResultMsg({ ok: false, text: 'LINE 警訊已送出，但通報未能記錄到安全地圖。' })
    } else {
      setResultMsg({ ok: false, text: `通報未送出。${notify.message}` })
    }

    if (reportOk) onReportSuccess?.(categoryLabel, lat, lng)

    setTimeout(() => {
      setResultMsg(null)
      setLoadingCategory(null)
      onClose()
    }, 3500)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      padding: '0 0 20px', animation: 'fadeIn 0.2s ease'
    }} onClick={onClose}>
      <div
        style={{
          width: '100%', maxWidth: 420, background: '#FFFFFF',
          borderRadius: '24px 24px 0 0', padding: '24px 20px 32px',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.3)', color: '#111827'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconAlertTriangle size={24} color="#DC2626" />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#DC2626' }}>不安通報</div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>預防性警訊發送與社區安全記錄</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#F3F4F6', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <IconX size={16} />
          </button>
        </div>

        {resultMsg ? (
          <div style={{
            background: resultMsg.ok ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${resultMsg.ok ? '#10B981' : '#EF4444'}`,
            color: resultMsg.ok ? '#047857' : '#B91C1C',
            borderRadius: 16, padding: '16px', fontSize: 14, lineHeight: 1.6, textAlign: 'center',
            fontWeight: 600, margin: '16px 0'
          }}>
            {resultMsg.text}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 16, lineHeight: 1.5 }}>
              感到周遭狀況不對勁？請點擊以下分類，系統將<b>發送 LINE 警訊給緊急聯絡人</b>，並在地圖記錄治安熱點：
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  disabled={loadingCategory !== null}
                  onClick={() => handleSelectCategory(c.label)}
                  style={{
                    background: loadingCategory === c.label ? '#FEE2E2' : '#F9FAFB',
                    border: '1px solid #E5E7EB', borderRadius: 16,
                    padding: '12px 16px', textAlign: 'left', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 2,
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {c.icon}
                    {loadingCategory === c.label ? '發送通報中...' : c.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280', paddingLeft: 26 }}>{c.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
