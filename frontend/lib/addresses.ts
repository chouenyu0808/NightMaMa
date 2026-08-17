/**
 * 住家 / 公司常用地址：localStorage 為主，Firestore 為跨裝置同步。
 *
 * 抽成共用模組的原因：先前設定頁改成把兩個地址存成一包
 * `nightmama_addresses` JSON，但首頁的快捷標籤仍讀舊的
 * `nightmama_home_address` / `nightmama_work_address`，導致存了地址之後
 * 首頁按鈕永遠是空的。這裡統一讀寫路徑，並保留對舊 key 的相容。
 */
import { getUserId } from './user'

const ADDRESSES_KEY = 'nightmama_addresses'
const LEGACY_HOME_KEY = 'nightmama_home_address'
const LEGACY_WORK_KEY = 'nightmama_work_address'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

export interface Addresses {
  home: string
  work: string
}

export function loadAddresses(): Addresses {
  if (typeof window === 'undefined') return { home: '', work: '' }

  try {
    const raw = localStorage.getItem(ADDRESSES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { home: parsed?.home ?? '', work: parsed?.work ?? '' }
    }
  } catch {
    // 格式壞掉就退回舊 key
  }

  // 舊版格式：兩個獨立的 key
  return {
    home: localStorage.getItem(LEGACY_HOME_KEY) ?? '',
    work: localStorage.getItem(LEGACY_WORK_KEY) ?? '',
  }
}

/** 同時寫入新舊 key，避免任一端讀不到。 */
export function saveAddresses(addresses: Addresses): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(ADDRESSES_KEY, JSON.stringify(addresses))
  localStorage.setItem(LEGACY_HOME_KEY, addresses.home)
  localStorage.setItem(LEGACY_WORK_KEY, addresses.work)
}

/** 推送到 Firestore 做跨裝置同步。後端不可用時靜默失敗，localStorage 已經存好。 */
export async function syncAddressesToBackend(addresses: Addresses): Promise<void> {
  const userId = getUserId()
  if (!BACKEND_URL || !userId) return
  try {
    await fetch(`${BACKEND_URL}/users/${userId}/addresses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addresses),
    })
  } catch {
    // 後端連不上，localStorage 仍是可用的來源
  }
}

/** 從 Firestore 拉回地址；沒有資料或後端不可用時回傳 null。 */
export async function loadAddressesFromBackend(): Promise<Addresses | null> {
  const userId = getUserId()
  if (!BACKEND_URL || !userId) return null
  try {
    const res = await fetch(`${BACKEND_URL}/users/${userId}/addresses`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data || (!data.home && !data.work)) return null
    return { home: data.home ?? '', work: data.work ?? '' }
  } catch {
    return null
  }
}
