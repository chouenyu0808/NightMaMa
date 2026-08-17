'use client'

import { useState, useEffect } from 'react'
import { NavBar } from '@/app/components/NavBar'
import { IconSettings, IconSend, IconTrash, IconCheckCircle, IconHeart, IconMoon, IconMap, IconCamera, IconMic, IconRoute } from '@/components/Icons'

const CONTACTS_KEY = 'nightmama_contacts'
const GEMINI_KEY_STORAGE = 'nightmama_gemini_key'

interface Contact {
  id: string
  name: string
  lineToken: string
}

export default function SettingsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [name, setName] = useState('')
  const [lineToken, setLineToken] = useState('')
  const [saved, setSaved] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)

  const [homeAddress, setHomeAddress] = useState('')
  const [workAddress, setWorkAddress] = useState('')
  const [addressSaved, setAddressSaved] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(CONTACTS_KEY)
    if (stored) setContacts(JSON.parse(stored))

    const storedHome = localStorage.getItem('nightmama_home_address')
    if (storedHome) setHomeAddress(storedHome)

    const storedWork = localStorage.getItem('nightmama_work_address')
    if (storedWork) setWorkAddress(storedWork)
  }, [])

  const saveAddresses = () => {
    localStorage.setItem('nightmama_home_address', homeAddress.trim())
    localStorage.setItem('nightmama_work_address', workAddress.trim())
    setAddressSaved(true)
    setTimeout(() => setAddressSaved(false), 2000)
  }

  const saveContact = () => {
    if (!name.trim() || !lineToken.trim()) return
    const newContact: Contact = { id: Date.now().toString(), name: name.trim(), lineToken: lineToken.trim() }
    const updated = [...contacts, newContact]
    setContacts(updated)
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(updated))
    setName('')
    setLineToken('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const removeContact = (id: string) => {
    const updated = contacts.filter(c => c.id !== id)
    setContacts(updated)
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(updated))
  }

  const sendTestNotification = async (token: string) => {
    setIsSendingTest(true)
    try {
      await fetch('/api/line-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          message: '\n🌙 NightMaMa 測試通知\n\n你已成功設定 NightMaMa 緊急通知！\n當你的聯絡人觸發 SOS 時，你會收到即時定位通知。',
        }),
      })
      setTestSent(true)
      setTimeout(() => setTestSent(false), 3000)
    } catch {
      alert('發送失敗，請確認 LINE Notify Token 是否正確')
    } finally {
      setIsSendingTest(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{ padding: '52px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontWeight: 900, fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}><IconSettings size={20} /> 設定</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>管理緊急聯絡人與 LINE 通知</div>
      </div>

      <div className="scrollable" style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 80 }}>



        {/* 常用地址設定 (Home & Work Shortcut Addresses) */}
        <div className="glass" style={{ padding: 20, borderRadius: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🏠 常用地址設定 (快捷一鍵帶入)</span>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
            預先設定您的住家與公司/學校地址，搜尋路線時只需點選「快捷標籤」，即可自動填入目的地進行安心路線規劃！
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', marginBottom: 4, display: 'block' }}>🏠 住家地址</label>
              <input
                className="input-field"
                placeholder="例如：臺北市信義區市府路1號"
                value={homeAddress}
                onChange={e => setHomeAddress(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', marginBottom: 4, display: 'block' }}>🏢 公司 / 學校地址</label>
              <input
                className="input-field"
                placeholder="例如：臺北市大安區羅斯福路四段1號"
                value={workAddress}
                onChange={e => setWorkAddress(e.target.value)}
              />
            </div>

            <button className="btn-primary" onClick={saveAddresses} style={{ marginTop: 4 }}>
              {addressSaved ? '✅ 已成功儲存常用地址！' : '💾 儲存常用地址'}
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
              placeholder="LINE ID / User ID（選填，例：mom_line_id）"
              value={lineToken}
              onChange={e => setLineToken(e.target.value)}
            />

            <button className="btn-primary" onClick={saveContact} style={{ marginTop: 4 }}>
              {saved ? '✅ 已成功綁定緊急聯絡人！' : '+ 儲存緊急聯絡人'}
            </button>
          </div>
        </div>

        {/* Contacts list */}
        {contacts.length > 0 && (
          <div className="glass" style={{ padding: 20, borderRadius: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 14 }}>📋 緊急聯絡人</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {contacts.map(contact => (
                <div key={contact.id} className="glass-light" style={{ padding: '12px 16px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{contact.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Token: {contact.lineToken.slice(0, 8)}…
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn-icon"
                      style={{ width: 36, height: 36, fontSize: 14, background: 'rgba(16,185,129,0.2)' }}
                      onClick={() => sendTestNotification(contact.lineToken)}
                      disabled={isSendingTest}
                    >
                      {testSent ? '✅' : '📤'}
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
            <div>🤖 AI 陪聊：Google Gemini 3.6 Flash / 2.5 Flash</div>
            <div>🗺️ 地圖路線：Google Maps Routes API (Custom Safety Matrix)</div>
          </div>
        </div>
      </div>

      <NavBar active="settings" />
    </div>
  )
}
