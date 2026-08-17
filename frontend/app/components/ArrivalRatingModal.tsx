'use client'

import { useState } from 'react'
import { IconCheckCircle, IconX } from '@/components/Icons'
import { primaryContact, sendLineNotification } from '@/lib/emergencyContacts'
import { getUserId } from '@/lib/user'

interface ArrivalRatingModalProps {
  isOpen: boolean
  onClose: () => void
  origin: string
  destination: string
  routeType: string
  /** 演算法算出的 0-100 分；取不到時為 null */
  safetyScore: number | null
  distanceM: number
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

const RATING_LABELS: Record<number, string> = {
  1: '很不安，不會再走',
  2: '有點不安',
  3: '普通',
  4: '還算安心',
  5: '很安心，會再走',
}

/**
 * 抵達目的地後跳出：回報平安給緊急聯絡人，並為這條路線打 1-5 分。
 *
 * 評分會連同當下的演算法分數一起送到後端，之後才能比對「使用者主觀感受」
 * 與「路燈/CCTV 客觀評分」的落差，用來校準權重與門檻。
 */
export default function ArrivalRatingModal({
  isOpen,
  onClose,
  origin,
  destination,
  routeType,
  safetyScore,
  distanceM,
}: ArrivalRatingModalProps) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [savedMsg, setSavedMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [notifyMsg, setNotifyMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isNotifying, setIsNotifying] = useState(false)

  if (!isOpen) return null

  const contact = primaryContact()

  const notifyArrival = async () => {
    setIsNotifying(true)
    setNotifyMsg(null)
    const msg =
      `✅【NightMaMa 平安回報】\n我已平安抵達「${destination}」。\n⏰ ${new Date().toLocaleString('zh-TW')}\n\n謝謝你的關心！`
    const outcome = await sendLineNotification(msg, contact?.lineUserId)
    setIsNotifying(false)

    if (outcome.sent) {
      setNotifyMsg({ ok: true, text: outcome.message })
      return
    }
    if (outcome.shareUrl) {
      setNotifyMsg({ ok: false, text: outcome.message })
      window.location.assign(outcome.shareUrl)
      return
    }
    setNotifyMsg({ ok: false, text: outcome.message })
  }

  const submitRating = async (value: number) => {
    setRating(value)
    const userId = getUserId()

    // 後端未設定時仍讓使用者看到選擇被記錄，但要說清楚沒有上傳
    if (!BACKEND_URL || !userId) {
      setSavedMsg({ ok: false, text: '評分未上傳（尚未連線至後端），僅這次有效。' })
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch(`${BACKEND_URL}/users/${userId}/route-ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination,
          rating: value,
          route_type: routeType,
          safety_score: safetyScore,
          distance_m: distanceM,
        }),
      })
      setSavedMsg(
        res.ok
          ? { ok: true, text: '感謝評分！這會幫助我們調整安全演算法。' }
          : { ok: false, text: `評分上傳失敗（HTTP ${res.status}）。` }
      )
    } catch {
      setSavedMsg({ ok: false, text: '網路連線失敗，評分未上傳。' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(8,11,20,0.9)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 460, background: '#111827',
        borderRadius: '22px 22px 0 0', padding: '22px 18px 30px',
        border: '1px solid rgba(16,185,129,0.35)', color: '#fff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <IconCheckCircle size={26} color="#10b981" />
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#10b981' }}>已抵達目的地</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{destination}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%',
              width: 30, height: 30, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <IconX size={15} color="#fff" />
          </button>
        </div>

        {/* 平安回報 */}
        <button
          onClick={notifyArrival}
          disabled={isNotifying}
          style={{
            width: '100%', marginTop: 16, padding: '13px', borderRadius: 14,
            background: 'linear-gradient(135deg,#06C755,#04a344)', border: 'none',
            color: '#fff', fontSize: 15, fontWeight: 800,
            cursor: isNotifying ? 'wait' : 'pointer', opacity: isNotifying ? 0.6 : 1,
          }}
        >
          {isNotifying ? '傳送中…' : contact
            ? `💚 回報平安給 ${contact.name}`
            : '💚 用 LINE 回報平安'}
        </button>

        {notifyMsg && (
          <div style={{
            marginTop: 8, borderRadius: 10, padding: '9px 12px', fontSize: 12,
            lineHeight: 1.5, fontWeight: 600,
            background: notifyMsg.ok ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
            color: notifyMsg.ok ? '#34d399' : '#fbbf24',
          }}>
            {notifyMsg.text}
          </div>
        )}

        {/* 路線評分 */}
        <div style={{ marginTop: 22, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>這條路線走起來安心嗎？</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 14, lineHeight: 1.5 }}>
            你的評分會用來校準夜間安全演算法
            {safetyScore !== null && `（系統原本評 ${(safetyScore / 10).toFixed(1)} 分）`}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
            {[1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                onClick={() => submitRating(v)}
                onMouseEnter={() => setHovered(v)}
                onMouseLeave={() => setHovered(0)}
                disabled={isSaving}
                aria-label={`${v} 分：${RATING_LABELS[v]}`}
                style={{
                  width: 52, height: 52, borderRadius: 14, cursor: isSaving ? 'wait' : 'pointer',
                  fontSize: 26, lineHeight: 1,
                  border: (hovered || rating) >= v ? '1.5px solid #fbbf24' : '1px solid rgba(255,255,255,0.12)',
                  background: (hovered || rating) >= v ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.04)',
                  transition: 'all 0.12s ease',
                }}
              >
                {(hovered || rating) >= v ? '⭐' : '☆'}
              </button>
            ))}
          </div>

          <div style={{
            textAlign: 'center', fontSize: 12, minHeight: 18,
            color: (hovered || rating) ? '#fbbf24' : 'rgba(255,255,255,0.35)', fontWeight: 700,
          }}>
            {RATING_LABELS[hovered || rating] || '點選星等給分'}
          </div>

          {savedMsg && (
            <div style={{
              marginTop: 10, borderRadius: 10, padding: '9px 12px', fontSize: 12,
              lineHeight: 1.5, fontWeight: 600, textAlign: 'center',
              background: savedMsg.ok ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
              color: savedMsg.ok ? '#34d399' : '#fbbf24',
            }}>
              {savedMsg.text}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 16, padding: '11px', borderRadius: 12,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          完成
        </button>
      </div>
    </div>
  )
}
