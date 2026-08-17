'use client'

import { useState, useEffect } from 'react'
import { NavBar } from '@/app/page'

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

  useEffect(() => {
    const stored = localStorage.getItem(CONTACTS_KEY)
    if (stored) setContacts(JSON.parse(stored))
  }, [])

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
        <div style={{ fontWeight: 900, fontSize: 20 }}>⚙️ 設定</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>管理緊急聯絡人與 LINE 通知</div>
      </div>

      <div className="scrollable" style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 80 }}>



        {/* LINE Notify setup */}
        <div className="glass" style={{ padding: 20, borderRadius: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>💚 LINE 通知設定</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 16 }}>
            新增緊急聯絡人後，SOS 時自動發送 LINE 通知含即時定位
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              className="input-field"
              placeholder="聯絡人姓名（例：媽媽）"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <input
              className="input-field"
              placeholder="LINE Notify Token"
              value={lineToken}
              onChange={e => setLineToken(e.target.value)}
              type="password"
            />

            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              📌 取得 Token：前往{' '}
              <a href="https://notify-bot.line.me" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>
                notify-bot.line.me
              </a>
              {' '}→「發行權杖」→ 輸入房間名稱 → 複製 Token
            </div>

            <button className="btn-primary" onClick={saveContact}>
              {saved ? '✅ 已儲存！' : '+ 新增聯絡人'}
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
