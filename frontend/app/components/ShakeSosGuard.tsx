'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconAlertTriangle, IconVibrate, IconX } from '@/components/Icons'
import { triggerSos } from '@/lib/emergencyContacts'
import { useShakeDetection } from '@/lib/useShakeDetection'

interface ShakeSosGuardProps {
  /** 目前位置，會附在求救訊息裡 */
  currentPos: { lat: number; lng: number } | null
  destination?: string
}

/** 誤觸的代價很高，但真的遇險時又沒空按確認。倒數＋可取消是兩者間的折衷。 */
const COUNTDOWN_SEC = 5

/** 記住使用者關掉過，下次就不要又自動開 */
const PREF_KEY = 'nightmama_shake_sos'

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
  // Portal 需要 document，SSR 期間不存在
  const [mounted, setMounted] = useState(false)

  const onShake = useCallback(() => {
    // 已經在倒數中就不要重複觸發
    setPending(prev => prev || true)
  }, [])

  const { permission, requestPermission } = useShakeDetection(enabled && !pending, onShake)

  useEffect(() => { queueMicrotask(() => setMounted(true)) }, [])

  /**
   * 預設開啟。
   *
   * Android 與桌面版不需要授權，requestPermission() 會直接回 granted，
   * 所以可以在掛載時自動啟用。iOS 13+ 規定必須在使用者手勢裡呼叫，
   * 這裡會拿到 denied 或直接拋錯 —— 那種情況就維持關閉，由使用者
   * 自己點開關（點擊本身就是手勢，那時才要得到授權）。
   *
   * 使用者手動關掉過就尊重他的選擇，不要每次進導航又自動打開。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(PREF_KEY) === 'off') return

    let cancelled = false
    requestPermission().then(p => {
      if (!cancelled && p === 'granted') setEnabled(true)
    })
    return () => { cancelled = true }
  }, [requestPermission])

  const toggle = async () => {
    if (enabled) {
      setEnabled(false)
      localStorage.setItem(PREF_KEY, 'off')
      return
    }
    localStorage.removeItem(PREF_KEY)
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
      {/*
        整列可點的開關。做成一整條而不是一顆孤立的小藥丸：上方三顆動作鈕
        是等寬並排的，一顆靠左的小標籤會顯得斷開；整列對齊才收得乾淨，
        點擊區域也大得多（單手、匆忙時比較好按）。
      */}
      <button
        onClick={toggle}
        disabled={permission === 'unsupported'}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', borderRadius: 12, textAlign: 'left',
          cursor: permission === 'unsupported' ? 'not-allowed' : 'pointer',
          background: enabled ? 'rgba(239,68,68,0.14)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${enabled ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.12)'}`,
          opacity: permission === 'unsupported' ? 0.45 : 1,
        }}
      >
        <IconVibrate size={15} color={enabled ? '#fca5a5' : 'rgba(255,255,255,0.6)'} />

        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'block', fontSize: 12, fontWeight: 800,
            color: enabled ? '#fca5a5' : 'rgba(255,255,255,0.8)',
          }}>
            搖晃求救
          </span>
          <span style={{
            display: 'block', fontSize: 10, marginTop: 1,
            color: 'rgba(255,255,255,0.45)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {permission === 'unsupported'
              ? '此裝置不支援動作感測'
              : permission === 'denied'
                ? '權限被拒絕，請於瀏覽器開啟動作權限'
                : enabled
                  ? '用力搖三秒發出求救 · 螢幕需亮著'
                  : '點此開啟'}
          </span>
        </span>

        {/* 狀態徽章：一眼看出現在到底有沒有在偵測 */}
        {permission !== 'unsupported' && (
          <span style={{
            flexShrink: 0, fontSize: 10, fontWeight: 900, padding: '3px 9px', borderRadius: 999,
            background: enabled ? '#ef4444' : 'rgba(255,255,255,0.12)',
            color: enabled ? '#fff' : 'rgba(255,255,255,0.6)',
          }}>
            {enabled ? '已開啟' : '關閉'}
          </span>
        )}
      </button>

      {/*
        倒數視窗與結果提示都用 portal 掛到 document.body。

        這個元件掛在導航頁的底部面板裡，而那個面板有 overflow:hidden 與
        backdrop-filter —— 兩者都會建立 containing block，讓子層的
        position:fixed 改以面板為基準定位並被裁切。實測畫面下半部
        （含「我沒事，取消」按鈕）會被切掉。Portal 讓它脫離那個容器。
      */}
      {mounted && pending && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
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
        </div>,
        document.body
      )}

      {/* 送出結果 */}
      {mounted && result && createPortal(
        <div
          onClick={() => setResult(null)}
          style={{
            position: 'fixed', left: 16, right: 16, bottom: 90, zIndex: 9000,
            borderRadius: 14, padding: '12px 16px', fontSize: 13, lineHeight: 1.6,
            fontWeight: 700, cursor: 'pointer', color: '#fff',
            background: result.ok ? 'rgba(16,185,129,0.95)' : 'rgba(245,158,11,0.95)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
          }}
        >
          {result.ok ? '✅ ' : '⚠️ '}{result.text}
          <IconX size={12} color="#fff" />
        </div>,
        document.body
      )}
    </>
  )
}
