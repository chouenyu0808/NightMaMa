/**
 * 緊急聯絡人（localStorage 為主、Firestore 為跨裝置同步）與 LINE 推播的共用邏輯。
 */
import { getUserId } from './user'

export const CONTACTS_KEY = 'nightmama_contacts'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

/** LINE User ID 格式：U + 32 個十六進位字元 */
export const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/i

export interface Contact {
  id: string
  name: string
  /** 撥號用。SOS 的「直接撥給聯絡人」需要它。 */
  phone: string
  /**
   * LINE Messaging API 的收件人 ID（U + 32 碼）。
   *
   * 一般使用者在 LINE App 裡看不到自己的這組 ID —— 個人資料頁上那個
   * 「用戶 ID」是搜尋用的 LINE ID，不能拿來推播。因此這裡是選填：
   * 沒有值時，通知改走 LINE 分享連結（見 buildLineShareUrl），
   * 由使用者自己選收件人送出，不需要任何綁定。
   *
   * 之後接上 LINE Login 綁定流程後，這個欄位才會自動被填入。
   */
  lineUserId: string
}

interface StoredContact {
  id?: string
  name?: string
  phone?: string
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
        phone: (c.phone ?? '').trim(),
        lineUserId: (c.lineUserId ?? c.lineToken ?? '').trim(),
      }))
      .filter(c => c.name || c.phone || c.lineUserId)
  } catch {
    return []
  }
}

export function saveContacts(contacts: Contact[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts))
}

/** 第一個聯絡人，作為 SOS 與抵達通知的預設對象。 */
export function primaryContact(): Contact | null {
  return loadContacts()[0] ?? null
}

/** 第一個「已完成 LINE 綁定」、可直接推播的聯絡人。 */
export function primaryRecipient(): Contact | null {
  return loadContacts().find(c => LINE_USER_ID_PATTERN.test(c.lineUserId)) ?? null
}

/**
 * LINE 分享連結：開啟 LINE 並帶入預填訊息，由使用者自己挑收件人。
 *
 * 不需要 userId，也不需要 Channel Access Token，所以任何人都能立即使用。
 * 代價是多一個「選聯絡人」的動作，無法全自動送出。
 */
export function buildLineShareUrl(message: string): string {
  return `https://line.me/R/msg/text/?${encodeURIComponent(message)}`
}

// ─── Firestore 跨裝置同步 ───────────────────────────────────────────
// 後端欄位名是 line_user_id，與前端的 lineUserId 對應。

interface BackendContact {
  id: string
  name: string
  phone?: string
  line_user_id: string
}

/** 推送到 Firestore。後端不可用時靜默失敗，localStorage 已經存好。 */
export async function syncContactsToBackend(contacts: Contact[]): Promise<void> {
  const userId = getUserId()
  if (!BACKEND_URL || !userId) return
  try {
    await fetch(`${BACKEND_URL}/users/${userId}/contacts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contacts: contacts.map(c => ({
          id: c.id, name: c.name, phone: c.phone, line_user_id: c.lineUserId,
        })),
      }),
    })
  } catch {
    // 後端連不上，localStorage 仍是可用的來源
  }
}

/**
 * 從 Firestore 拉回聯絡人並寫入 localStorage。
 *
 * 這個很重要：LINE Login 綁定發生在「聯絡人的裝置」上，結果只存在 Firestore。
 * 使用者自己的裝置若不主動拉一次，localStorage 永遠是空的 —— 綁定明明成功，
 * 按 SOS 卻找不到聯絡人。因此凡是會用到聯絡人的頁面都應該在載入時呼叫一次。
 *
 * 靜默失敗：後端不可用時保留本機既有資料，不影響求救流程。
 */
export async function refreshContactsFromBackend(): Promise<Contact[] | null> {
  const remote = await loadContactsFromBackend()
  if (remote) saveContacts(remote)
  return remote
}

/** 從 Firestore 拉回聯絡人；沒有資料或後端不可用時回傳 null。 */
export async function loadContactsFromBackend(): Promise<Contact[] | null> {
  const userId = getUserId()
  if (!BACKEND_URL || !userId) return null
  try {
    const res = await fetch(`${BACKEND_URL}/users/${userId}/contacts`)
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data?.contacts) || data.contacts.length === 0) return null
    return (data.contacts as BackendContact[]).map(c => ({
      id: c.id,
      name: c.name,
      phone: (c.phone ?? '').trim(),
      lineUserId: (c.line_user_id ?? '').trim(),
    }))
  } catch {
    return null
  }
}

export interface NotifyOutcome {
  /** true 代表訊息「確實已由伺服器送出」。分享連結不算，因為還沒送出。 */
  sent: boolean
  /**
   * 有值時代表需要使用者接手：把這個網址開起來，LINE 會帶著預填訊息跳出，
   * 由使用者挑選收件人。呼叫端務必在 click handler 裡開啟，否則會被擋。
   */
  shareUrl?: string
  /** 給使用者看的說明。失敗時務必顯示，不可假裝成功。 */
  message: string
}

/**
 * 送出 LINE 通知，並據實回報結果。
 *
 * 兩條路徑：
 * 1. 聯絡人已完成 LINE 綁定（有 userId）→ 伺服器直接推播，全自動。
 * 2. 尚未綁定 → 回傳分享連結，由使用者在 LINE 裡選收件人送出。
 *
 * 刻意不吞掉錯誤，也刻意不把「產生了分享連結」當成 sent：對安全性 App
 * 來說，讓使用者以為求救訊息已送達、但其實還躺在待送狀態，比直接
 * 告知「需要你再點一下」危險得多。
 */
export async function sendLineNotification(
  message: string,
  targetId?: string
): Promise<NotifyOutcome> {
  const recipient = (targetId ?? primaryRecipient()?.lineUserId ?? '').trim()

  // 尚未綁定：退回分享連結，功能仍可用
  if (!LINE_USER_ID_PATTERN.test(recipient)) {
    return {
      sent: false,
      shareUrl: buildLineShareUrl(message),
      message: '請在 LINE 中選擇要通知的聯絡人並送出。',
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
    // 推播失敗時仍提供分享連結，讓使用者還有辦法把訊息送出去
    return {
      sent: false,
      shareUrl: buildLineShareUrl(message),
      message: data?.error || `自動推播失敗（HTTP ${res.status}），請改用 LINE 手動傳送。`,
    }
  } catch {
    return {
      sent: false,
      shareUrl: buildLineShareUrl(message),
      message: '網路連線失敗，請改用 LINE 手動傳送。',
    }
  }
}
