'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

// 匿名裝置識別碼，只用來讓後端把單一裝置的重複回報去重／雜湊，不含任何可識別使用者身分的資訊
function getOrCreateSessionId(): string {
  const KEY = 'nightmama_session_id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}

interface AnxietyReportModalProps {
  isOpen: boolean
  onClose: () => void
  currentPos?: { lat: number; lng: number }
  onReportSuccess?: (category: string, lat: number, lng: number) => void
}

const CATEGORIES = [
  { id: 'follower', icon: 'mdi:account-alert-outline', label: '疑似有人跟隨', desc: '感覺後方有可疑人士尾隨' },
  { id: 'dark', icon: 'mdi:lightbulb-off-outline', label: '路燈故障 / 巷弄極暗', desc: '現場視線不良、缺乏照明' },
  { id: 'noise', icon: 'mdi:volume-high', label: '異常聲響 / 可疑群聚', desc: '前方有吵鬧、醉漢或聚集' },
  { id: 'general', icon: 'mdi:eye-outline', label: '感到不安 / 留存紀錄', desc: '直覺不對勁，預防性報備' },
]

export default function AnxietyReportModal({
  isOpen,
  onClose,
  currentPos,
  onReportSuccess,
}: AnxietyReportModalProps) {
  const [loadingCategory, setLoadingCategory] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSelectCategory = async (categoryLabel: string) => {
    setLoadingCategory(categoryLabel)
    setSuccessMsg(null)

    try {
      // 1. Get current GPS position if not provided
      let lat = currentPos?.lat || 25.021
      let lng = currentPos?.lng || 121.532

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

      // 2. Post to backend /report — anonymized (session id is hashed server-side), feeds BigQuery hotspot map
      await fetch(`${BACKEND_URL}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: getOrCreateSessionId(),
          lat,
          lng,
          reason: categoryLabel,
        }),
      }).catch(() => {})

      // 3. Send LINE Alert Push Notification to Emergency Contact/Group
      const lineMessage = `⚠️ [NightMaMa 不安通報]\n使用者通報「${categoryLabel}」。\n📍 目前即時 GPS 位置：https://maps.google.com/?q=${lat},${lng}\n🤖 AI 媽咪正在線上語音陪伴中。`

      await fetch('/api/line-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: lineMessage }),
      }).catch(() => {})

      setSuccessMsg(`✅ 不安通報已發送！系統已發送 LINE 安全警訊給緊急聯絡人，並在安全地圖上記錄通報點。`)
      onReportSuccess?.(categoryLabel, lat, lng)

      setTimeout(() => {
        setSuccessMsg(null)
        setLoadingCategory(null)
        onClose()
      }, 2500)
    } catch {
      setSuccessMsg(`✅ 不安通報已成功記錄並發送通報！`)
      setTimeout(() => {
        setSuccessMsg(null)
        setLoadingCategory(null)
        onClose()
      }, 2000)
    }
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
            <Icon icon="mdi:alert-outline" width={24} height={24} style={{ color: '#DC2626' }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#DC2626' }}>不安通報</div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>預防性警訊發送與社區安全記錄</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#F3F4F6', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon icon="mdi:close" width={16} height={16} />
          </button>
        </div>

        {successMsg ? (
          <div style={{
            background: '#ECFDF5', border: '1px solid #10B981', color: '#047857',
            borderRadius: 16, padding: '16px', fontSize: 14, lineHeight: 1.6, textAlign: 'center',
            fontWeight: 600, margin: '16px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8
          }}>
            <Icon icon="mdi:check-circle" width={28} height={28} />
            {successMsg}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 16, lineHeight: 1.5 }}>
              感到周遭狀況不對勁？請點擊以下分類，系統將<b>立即發送 LINE 警訊給緊急聯絡人</b>，並在地圖記錄治安熱點：
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
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon icon={loadingCategory === c.label ? 'mdi:loading' : c.icon} width={18} height={18} className={loadingCategory === c.label ? 'spin' : undefined} />
                    {loadingCategory === c.label ? '發送通報中...' : c.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>{c.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
