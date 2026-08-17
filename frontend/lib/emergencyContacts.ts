/**
 * 緊急聯絡人（存在 localStorage）與 LINE 推播的共用邏輯。
 */

export const CONTACTS_KEY = 'nightmama_contacts'

/** LINE User ID 格式：U + 32 個十六進位字元 */
export const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/i

export interface Contact {
  id: string
  name: string
  /** 收件人的 LINE User ID。舊版存的是 `lineToken`，讀取時會自動搬移。 */
  lineUserId: string
}

interface StoredContact {
  id?: string
  name?: string
  lineUserId?: string
  /** 舊欄位名稱，語意上一直都是收件人 ID 而非 token。 */
  lineToken?: string
}

export function loadContacts(): Contact[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CONTACTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as StoredContact[])
      .map((c, i) => ({
        id: c.id ?? String(i),
        name: c.name ?? '',
        lineUserId: (c.lineUserId ?? c.lineToken ?? '').trim(),
      }))
      .filter(c => c.name || c.lineUserId)
  } catch {
    return []
  }
}

export function saveContacts(contacts: Contact[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts))
}

/** 取出第一個有合法 LINE User ID 的聯絡人。 */
export function primaryRecipient(): Contact | null {
  return loadContacts().find(c => LINE_USER_ID_PATTERN.test(c.lineUserId)) ?? null
}

export interface NotifyOutcome {
  sent: boolean
  /** 給使用者看的說明。失敗時務必顯示，不可假裝成功。 */
  message: string
}

/**
 * 送出 LINE 通知，並據實回報結果。
 *
 * 刻意不吞掉錯誤：對安全性 App 來說，讓使用者以為求救訊息已送達、
 * 但其實根本沒送出去，比直接告知失敗危險得多。
 */
export async function sendLineNotification(
  message: string,
  targetId?: string
): Promise<NotifyOutcome> {
  const recipient = (targetId ?? primaryRecipient()?.lineUserId ?? '').trim()

  if (!LINE_USER_ID_PATTERN.test(recipient)) {
    return {
      sent: false,
      message: '尚未設定緊急聯絡人，LINE 通知未送出。請到「設定」頁新增聯絡人的 LINE User ID。',
    }
  }

  try {
    const res = await fetch('/api/line-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: recipient, message }),
    })

    if (res.ok) {
      return { sent: true, message: 'LINE 通知已送出給緊急聯絡人。' }
    }

    const data = await res.json().catch(() => null)
    return {
      sent: false,
      message: data?.error || `LINE 通知發送失敗（HTTP ${res.status}）。`,
    }
  } catch {
    return { sent: false, message: '網路連線失敗，LINE 通知未送出。' }
  }
}
