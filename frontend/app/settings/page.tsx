'use client'

import { useState, useEffect } from 'react'
import { NavBar } from '@/app/components/NavBar'
import { IconSettings, IconHeart } from '@/components/Icons'
import {
  loadContacts,
  saveContacts,
  syncContactsToBackend,
  loadContactsFromBackend,
  sendLineNotification,
  LINE_USER_ID_PATTERN,
  type Contact,
} from '@/lib/emergencyContacts'
import {
  loadAddresses,
  saveAddresses as persistAddresses,
  syncAddressesToBackend,
  loadAddressesFromBackend,
} from '@/lib/addresses'

export default function SettingsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [name, setName] = useState('')
  const [lineUserId, setLineUserId] = useState('')
  const [inputError, setInputError] = useState('')
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [isSendingTest, setIsSendingTest] = useState(false)

  // 常用地址
  const [homeAddress, setHomeAddress] = useState('')
  const [workAddress, setWorkAddress] = useState('')
  const [addressSaved, setAddressSaved] = useState(false)

  // localStorage 只能在瀏覽器讀取，因此掛載後才同步進 state。
  // 包在 queueMicrotask 裡是為了避開 effect body 內同步 setState 造成的串接渲染。
  useEffect(() => {
    queueMicrotask(() => {
      // 先讀本機，畫面立刻有東西
      setContacts(loadContacts())
      const local = loadAddresses()
      setHomeAddress(local.home)
      setWorkAddress(local.work)

      // 再嘗試用 Firestore 的資料覆蓋（跨裝置同步）
      loadContactsFromBackend().then(remote => {
        if (remote) {
          setContacts(remote)
          saveContacts(remote)
        }
      })
      loadAddressesFromBackend().then(remote => {
        if (remote) {
          setHomeAddress(remote.home)
          setWorkAddress(remote.work)
          persistAddresses(remote)
        }
      })
    })
  }, [])

  const saveAddresses = async () => {
    const addresses = { home: homeAddress.trim(), work: workAddress.trim() }
    // persistAddresses 會同時寫新舊 localStorage key，首頁快捷標籤才讀得到
    persistAddresses(addresses)
    setAddressSaved(true)
    setTimeout(() => setAddressSaved(false), 2000)
    await syncAddressesToBackend(addresses)
  }

  const saveContact = () => {
    const trimmedName = name.trim()
    const trimmedId = lineUserId.trim()

    if (!trimmedName) {
      setInputError('請輸入聯絡人姓名')
      return
    }
    // 先擋掉格式錯誤，否則要等到真的觸發 SOS 才會發現通知送不出去
    if (!LINE_USER_ID_PATTERN.test(trimmedId)) {
      setInputError('LINE User ID 格式不正確，應為 U 開頭加上 32 個英數字元')
      return
    }

    setInputError('')
    const newContact: Contact = { id: Date.now().toString(), name: trimmedName, lineUserId: trimmedId }
    const updated = [...contacts, newContact]
    setContacts(updated)
    saveContacts(updated)
    syncContactsToBackend(updated)
    setName('')
    setLineUserId('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const removeContact = (id: string) => {
    const updated = contacts.filter(c => c.id !== id)
    setContacts(updated)
    saveContacts(updated)
    syncContactsToBackend(updated)
  }

  const sendTestNotification = async (targetId: string) => {
    setIsSendingTest(true)
    const outcome = await sendLineNotification(
      '\n🌙 NightMaMa 測試通知\n\n你已成功設定 NightMaMa 緊急通知！\n當你的聯絡人觸發 SOS 時，你會收到即時定位通知。',
      targetId
    )
    setTestResult({ ok: outcome.sent, text: outcome.message })
    setIsSendingTest(false)
    setTimeout(() => setTestResult(null), 5000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{ padding: '52px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontWeight: 900, fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}><IconSettings size={20} /> 設定</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>管理緊急聯絡人與 LINE 通知</div>
      </div>

      <div className="scrollable" style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 80 }}>

        {/* 常用地址設定 */}
        <div className="glass" style={{ padding: 20, borderRadius: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>🏠 常用地址設定 (快捷一鍵帶入)</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>
            預先設定您的住家與公司/學校地址，搜尋路線時只需點選「快捷標籤」，即可自動填入目的地進行安心路線規劃！
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', marginBottom: 6 }}>🏠 住家地址</div>
              <input
                className="input-field"
                placeholder="例如：臺北市信義區市府路1號"
                value={homeAddress}
                onChange={e => setHomeAddress(e.target.value)}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#34d399', marginBottom: 6 }}>🏢 公司 / 學校地址</div>
              <input
                className="input-field"
                placeholder="例如：臺北市大安區羅斯福路四段1號"
                value={workAddress}
                onChange={e => setWorkAddress(e.target.value)}
              />
            </div>

            <button className="btn-primary" onClick={saveAddresses} style={{ marginTop: 4 }}>
              {addressSaved ? '✅ 常用地址已儲存！' : '💾 儲存常用地址'}
            </button>
          </div>
        </div>

        {/* LINE Official Account Contact Setup */}
        <div className="glass" style={{ padding: 20, borderRadius: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><IconHeart size={16} color="#06C755" /> LINE 緊急求救通知設定</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
            一般使用者只需加入 <b>NightMaMa 官方帳號好友</b>，設定緊急聯絡人姓名與 LINE ID，觸發 SOS 時即可自動發送即時 GPS 定位警報！
          </div>

          <a
            href="https://line.me/R/ti/p/@344bwjhh"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: '#06C755', color: '#FFFFFF', fontWeight: 800, padding: '12px',
              borderRadius: 14, textDecoration: 'none', fontSize: 14, marginBottom: 14,
              boxShadow: '0 2px 8px rgba(6,199,85,0.3)'
            }}
          >
            💬 第一步：點此加入 NightMaMa 官方帳號好友 (@344bwjhh)
          </a>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              className="input-field"
              placeholder="聯絡人姓名（例：媽媽、男友、家人）"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <input
              className="input-field"
              placeholder="LINE User ID（U 開頭 33 碼，非顯示用的 LINE ID）"
              value={lineUserId}
              onChange={e => { setLineUserId(e.target.value); setInputError('') }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              這裡要填的是聯絡人加入官方帳號後產生的 <b>User ID</b>（U 開頭 33 碼），
              不是個人資料頁上的 LINE ID。請勿在此填入任何 access token。
            </div>

            {inputError && (
              <div style={{ fontSize: 12, color: '#f87171', fontWeight: 600 }}>{inputError}</div>
            )}

            <button className="btn-primary" onClick={saveContact} style={{ marginTop: 4 }}>
              {saved ? '✅ 已成功綁定緊急聯絡人！' : '+ 儲存緊急聯絡人'}
            </button>
          </div>
        </div>

        {/* Contacts list */}
        {contacts.length > 0 && (
          <div className="glass" style={{ padding: 20, borderRadius: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 14 }}>📋 緊急聯絡人</div>

            {testResult && (
              <div style={{
                marginBottom: 12, padding: '10px 14px', borderRadius: 12, fontSize: 12,
                lineHeight: 1.5, fontWeight: 600,
                background: testResult.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                color: testResult.ok ? '#34d399' : '#f87171',
              }}>
                {testResult.text}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {contacts.map(contact => (
                <div key={contact.id} className="glass-light" style={{ padding: '12px 16px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{contact.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      User ID: {contact.lineUserId.slice(0, 8)}…
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn-icon"
                      style={{ width: 36, height: 36, fontSize: 14, background: 'rgba(16,185,129,0.2)' }}
                      onClick={() => sendTestNotification(contact.lineUserId)}
                      disabled={isSendingTest}
                    >
                      📤
                    </button>
                    <button
                      className="btn-icon"
                      style={{ width: 36, height: 36, fontSize: 14, background: 'rgba(239,68,68,0.2)' }}
                      onClick={() => removeContact(contact.id)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* About */}
        <div className="glass" style={{ padding: 20, borderRadius: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>🌙 關於 NightMaMa</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
            <div>🗺️ 路燈資料：台北市 145,919 盞路燈（data.taipei）</div>
            <div>📹 CCTV 資料：台北市 5,036 支警察局監視器</div>
            <div>🤖 AI 陪聊：Google Gemini 2.5 Flash</div>
            <div>🗺️ 地圖路線：Google Maps Directions API</div>
            <div>🛡️ 安全評分：照明 40% + CCTV 25% + 安全庇護點 35%，取最差路段</div>
          </div>
        </div>
      </div>

      <NavBar active="settings" />
    </div>
  )
}
