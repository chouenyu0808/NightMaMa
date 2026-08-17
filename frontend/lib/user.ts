/**
 * 持久化匿名 user_id（存於 localStorage），供後端 Firestore 資料關聯使用
 */
const USER_ID_KEY = 'nightmama_user_id'

export function getUserId(): string {
  if (typeof window === 'undefined') return ''
  let userId = localStorage.getItem(USER_ID_KEY)
  if (!userId) {
    userId = crypto.randomUUID()
    localStorage.setItem(USER_ID_KEY, userId)
  }
  return userId
}
