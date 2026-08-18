'use client'

import { useState } from 'react'
import {
  IconPhoneCall, IconAlertTriangle, IconPin, IconShield, IconX, IconUser, IconVideo,
} from '@/components/Icons'
import { primaryContact, triggerSos } from '@/lib/emergencyContacts'

interface SosOptionsSheetProps {
  isOpen: boolean
  onClose: () => void
  currentPos?: { lat: number; lng: number } | null
  destination?: string
}

type Tab = 'contact' | 'police'

/**
 * 導航途中按下 SOS 時跳出的選項面板。
 *
 * 刻意不做成「一按就自動報警」：誤觸的代價太高。這裡先讓使用者選對象
 * （緊急聯絡人 / 報警），每個動作都需要再點一次才會真的執行。
 */
export default function SosOptionsSheet({
  isOpen,
  onClose,
  currentPos,
  destination,
}: SosOptionsSheetProps) {
  const [tab, setTab] = useState<Tab>('contact')
  const [notifyMsg, setNotifyMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [isSending, setIsSending] = useState(false)

  if (!isOpen) return null

  const contact = primaryContact()
  const mapsUrl = currentPos
    ? `https://maps.google.com/?q=${currentPos.lat},${currentPos.lng}`
    : ''
  const coordText = currentPos
    ? `${currentPos.lat.toFixed(5)}, ${currentPos.lng.toFixed(5)}`
    : '定位失敗'

  const buildMessage = () =>
    `🚨【NightMaMa 緊急求救】\n我正在前往「${destination || '目的地'}」的路上，需要協助！\n\n` +
    (currentPos ? `📍 我的即時位置：${mapsUrl}\n` : '📍 定位失敗，未能取得位置\n') +
    `⏰ ${new Date().toLocaleString('zh-TW')}\n\n請立即與我聯繫確認狀況。`

  /**
   * 分享位置給聯絡人。走後端 /sos → Pub/Sub，會推播給「全部」已綁定的聯絡人；
   * 後端不可用時退回 LINE 分享連結，由使用者自己選收件人。
   */
  const shareLocation = async () => {
    setIsSending(true)
    setNotifyMsg(null)
    const outcome = await triggerSos(currentPos ?? null, buildMessage())
    setIsSending(false)

    if (outcome.sent) {
      setNotifyMsg({ ok: true, text: outcome.message })
      return
    }
    // 需要使用者接手：在同一個點擊事件內導向，才不會被瀏覽器擋掉
    if (outcome.shareUrl) {
      setNotifyMsg({ ok: false, text: outcome.message })
      window.location.assign(outcome.shareUrl)
      return
    }
    setNotifyMsg({ ok: false, text: outcome.message })
  }

  const tabBtn = (id: Tab, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => { setTab(id); setNotifyMsg(null) }}
      style={{
        flex: 1, padding: '11px 8px', borderRadius: 12, cursor: 'pointer',
        border: tab === id ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.12)',
        background: tab === id ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.04)',
        color: tab === id ? '#fca5a5' : 'rgba(255,255,255,0.7)',
        fontSize: 13, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}
    >
      {icon}{label}
    </button>
  )

  const actionBtn = (icon: React.ReactNode, label: string, sub: string, color: string, onClick: () => void, disabled = false) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '14px 16px', borderRadius: 14, textAlign: 'left',
        background: disabled ? 'rgba(255,255,255,0.04)' : color, border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        display: 'flex', flexDirection: 'column', gap: 3,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{label}</span>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>{sub}</span>
    </button>
  )

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(8,11,20,0.88)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: '#111827',
          borderRadius: '22px 22px 0 0', padding: '20px 18px 30px',
          border: '1px solid rgba(239,68,68,0.3)', color: '#fff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconAlertTriangle size={22} color="#ef4444" />
            <div>
              <div style={{ fontSize: 17, fontWeight: 900, color: '#ef4444' }}>緊急求助</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>選擇求助方式</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%',
              width: 32, height: 32, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <IconX size={16} color="#fff" />
          </button>
        </div>

        {/* 目前位置 —— 報警時要能唸得出來，所以座標直接顯示 */}
        <div style={{
          background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '9px 12px',
          marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <IconPin size={13} color={currentPos ? '#60a5fa' : '#f87171'} />
          <span style={{ fontSize: 12, color: currentPos ? 'rgba(255,255,255,0.85)' : '#f87171' }}>
            {currentPos ? `目前位置 ${coordText}` : '定位失敗 — 求助時請口述附近地標'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {tabBtn('contact', '緊急聯絡人', <IconUser size={14} color="currentColor" />)}
          {tabBtn('police', '報警', <IconShield size={14} color="currentColor" />)}
        </div>

        {tab === 'contact' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!contact && (
              <div style={{
                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)',
                borderRadius: 12, padding: '10px 12px', fontSize: 12, color: '#fbbf24', lineHeight: 1.5,
              }}>
                尚未設定緊急聯絡人。仍可用下方按鈕透過 LINE 傳送位置給任何人。
              </div>
            )}

            {actionBtn(
              <IconPhoneCall size={14} color="currentColor" />,
              contact?.phone ? `撥打給 ${contact.name}` : '撥打給緊急聯絡人',
              contact?.phone ? contact.phone : '尚未設定電話號碼，請先到「設定」頁填寫',
              'linear-gradient(135deg,#10b981,#047857)',
              () => { if (contact?.phone) window.location.assign(`tel:${contact.phone}`) },
              !contact?.phone
            )}

            {actionBtn(
              <IconPin size={14} color="currentColor" />,
              isSending ? '傳送中…' : '用 LINE 傳送我的即時位置',
              contact?.lineUserId ? `自動推播給 ${contact.name}` : '開啟 LINE 並選擇收件人送出',
              'linear-gradient(135deg,#06C755,#04a344)',
              shareLocation,
              isSending
            )}

            {notifyMsg && (
              <div style={{
                borderRadius: 10, padding: '9px 12px', fontSize: 12, lineHeight: 1.5, fontWeight: 600,
                background: notifyMsg.ok ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                color: notifyMsg.ok ? '#34d399' : '#fbbf24',
              }}>
                {notifyMsg.text}
              </div>
            )}
          </div>
        )}

        {tab === 'police' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {actionBtn(
              <IconPhoneCall size={14} color="currentColor" />,
              '撥打 110 報警',
              '直接接通警察局勤務指揮中心',
              'linear-gradient(135deg,#ef4444,#b91c1c)',
              () => { window.location.assign('tel:110') }
            )}

            {actionBtn(
              <IconVideo size={14} color="currentColor" />,
              '110 視訊報案',
              '開啟警政署官方視訊報案服務',
              'linear-gradient(135deg,#3b82f6,#1d4ed8)',
              () => window.open('https://www.npa.gov.tw/', '_blank', 'noopener,noreferrer')
            )}

            {actionBtn(
              <IconPhoneCall size={14} color="currentColor" />,
              '撥打 113 保護專線',
              '家暴、性侵、兒少保護專線',
              'linear-gradient(135deg,#8b5cf6,#6d28d9)',
              () => { window.location.assign('tel:113') }
            )}

            {/*
              視訊報案沒辦法在網頁裡直接接通 —— 那是警政署獨立的服務，
              App 只能引導過去。這裡據實說明，不做成好像按了就會通的樣子。
            */}
            <div style={{
              background: 'rgba(255,255,255,0.05)', borderRadius: 10,
              padding: '10px 12px', fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6,
            }}>
              視訊報案為警政署提供的獨立服務，本 App 僅提供入口導引，無法在頁面內直接接通。
              情況緊急請優先撥打 110。
              {currentPos && <><br />報案時可提供座標：<strong style={{ color: '#93c5fd' }}>{coordText}</strong></>}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 14, padding: '11px', borderRadius: 12,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <IconPhoneCall size={14} color="currentColor" /> 取消，繼續導航
        </button>
      </div>
    </div>
  )
}
