'use client'

import { useCallback, useEffect, useState } from 'react'
import { IconAlertTriangle, IconX } from '@/components/Icons'
import { triggerSos } from '@/lib/emergencyContacts'
import { useShakeDetection } from '@/lib/useShakeDetection'

interface ShakeSosGuardProps {
  /** 目前位置，會附在求救訊息裡 */
  currentPos: { lat: number; lng: number } | null
  destination?: string
}

/** 誤觸的代價很高，但真的遇險時又沒空按確認。倒數＋可取消是兩者間的折衷。 */
const COUNTDOWN_SEC = 5

/**
 * 猛烈搖晃手機 → 倒數 5 秒 → 自動發出求救。
 *
 * 對應評審提的「真的遇到危險時不可能專程打開 App 按 SOS」。
 * 搖晃是網頁唯一能做到的免看螢幕觸發方式（電源鍵是作業系統層級，
 * 網頁攔截不到）。
 */
export default function ShakeSosGuard({ currentPos, destination }: ShakeSosGuardProps) {
  const [enabled, setEnabled] = useState(false)
  const [pending, setPending] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const onShake = useCallback(() => {
    // 已經在倒數中就不要重複觸發
    setPending(prev => prev || true)
  }, [])

  const { permission, requestPermission } = useShakeDetection(enabled && !pending, onShake)

  const toggle = async () => {
    if (enabled) {
      setEnabled(false)
      return
    }
    // iOS 13+ 必須在使用者手勢裡要授權，所以綁在這個 onClick
    const p = await requestPermission()
    if (p === 'granted') setEnabled(true)
  }

  const dispatch = useCallback(async () => {
    const message =
      `🚨【NightMaMa 緊急求救】\n我在前往「${destination || '目的地'}」的路上搖晃手機求救！\n\n` +
      (currentPos
        ? `📍 我的即時位置：https://maps.google.com/?q=${currentPos.lat},${currentPos.lng}\n`
        : '📍 定位失敗，未能取得位置\n') +
      `⏰ ${new Date().toLocaleString('zh-TW')}\n\n請立即與我聯繫確認狀況。`

    const outcome = await triggerSos(currentPos, message)
    if (outcome.sent) {
      setResult({ ok: true, text: outcome.message })
      return
    }
    setResult({ ok: false, text: outcome.message })
    if (outcome.shareUrl) window.location.assign(outcome.shareUrl)
  }, [currentPos, destination])

  // 倒數。歸零就送出；使用者可在這段時間內取消。
  useEffect(() => {
    if (!pending) return
    queueMicrotask(() => setCountdown(COUNTDOWN_SEC))
    // 震動提示：螢幕可能在口袋裡看不到，觸覺是唯一的即時回饋
    navigator.vibrate?.([200, 100, 200, 100, 200])

    let n = COUNTDOWN_SEC
    const t = setInterval(() => {
      n -= 1
      setCountdown(n)
      navigator.vibrate?.(80)
      if (n <= 0) {
        clearInterval(t)
        setPending(false)
        dispatch()
      }
    }, 1000)
    return () => clearInterval(t)
  }, [pending, dispatch])

  return (
    <>
      {/* 開關。放在導航畫面上，使用者要能一眼看出現在有沒有在偵測。 */}
      <button
        onClick={toggle}
        disabled={permission === 'unsupported'}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', borderRadius: 999, cursor:
            permission === 'unsupported' ? 'not-allowed' : 'pointer',
          background: enabled ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.08)',
          border: `1px solid ${enabled ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.15)'}`,
          color: enabled ? '#fca5a5' : 'rgba(255,255,255,0.7)',
          fontSize: 11, fontWeight: 800,
          opacity: permission === 'unsupported' ? 0.4 : 1,
        }}
      >
        📳 {permission === 'unsupported'
          ? '此裝置不支援搖晃'
          : enabled ? '搖晃求救 已開啟' : '搖晃求救'}
      </button>

      {enabled && (
        <div style={{
          fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginTop: 4,
        }}>
          用力搖晃手機三秒即發出求救。螢幕需保持亮著 —— 熄屏或切換到其他 App 時
          瀏覽器會暫停偵測。
        </div>
      )}

      {permission === 'denied' && (
        <div style={{ fontSize: 10, color: '#fbbf24', marginTop: 4, lineHeight: 1.5 }}>
          動作感測器權限被拒絕。請到瀏覽器設定允許「動作與方向」後重新整理。
        </div>
      )}

      {/* 倒數確認 */}
      {pending && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 600,
          background: 'rgba(8,11,20,0.94)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 360, background: '#111827', borderRadius: 22,
            padding: '26px 22px', textAlign: 'center', color: '#fff',
            border: '1px solid rgba(239,68,68,0.55)',
          }}>
            <IconAlertTriangle size={40} color="#ef4444" />
            <div style={{ fontSize: 19, fontWeight: 900, color: '#ef4444', margin: '10px 0 6px' }}>
              偵測到搖晃求救
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 18 }}>
              {currentPos ? '將把你的即時位置傳給緊急聯絡人' : '定位失敗，訊息不會附上位置'}
            </div>

            <div style={{
              width: 92, height: 92, borderRadius: '50%', margin: '0 auto 18px',
              background: 'rgba(239,68,68,0.15)', border: '3px solid #ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 38, fontWeight: 900, color: '#ef4444',
            }}>
              {countdown}
            </div>

            <button
              onClick={() => { setPending(false); setResult(null) }}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, cursor: 'pointer',
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)',
                color: '#fff', fontSize: 16, fontWeight: 800,
              }}
            >
              我沒事，取消
            </button>
          </div>
        </div>
      )}

      {/* 送出結果 */}
      {result && (
        <div
          onClick={() => setResult(null)}
          style={{
            position: 'fixed', left: 16, right: 16, bottom: 90, zIndex: 600,
            borderRadius: 14, padding: '12px 16px', fontSize: 13, lineHeight: 1.6,
            fontWeight: 700, cursor: 'pointer', color: '#fff',
            background: result.ok ? 'rgba(16,185,129,0.95)' : 'rgba(245,158,11,0.95)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
          }}
        >
          {result.ok ? '✅ ' : '⚠️ '}{result.text}
          <IconX size={12} color="#fff" />
        </div>
      )}
    </>
  )
}
