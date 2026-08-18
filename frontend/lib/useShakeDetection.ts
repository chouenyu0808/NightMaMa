'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 猛烈搖晃手機觸發求救。
 *
 * 為什麼是搖晃而不是「連按電源鍵」：電源鍵是作業系統層級的事件，
 * 網頁完全攔截不到，那要出原生 App 才做得到。DeviceMotion 是瀏覽器
 * 唯一能用的免看螢幕輸入。
 *
 * 使用上的先天限制，UI 必須誠實告知：
 * 1. 頁面切到背景或螢幕關閉時，瀏覽器會暫停 JS，偵測就停了。
 *    也就是「手機放口袋」時這個功能其實不會運作 —— 要讓螢幕保持亮著。
 * 2. iOS 13+ 必須由使用者手勢觸發 requestPermission() 才拿得到感測器。
 * 3. 走路本身就會產生晃動，因此門檻設得高、且要求持續數秒，
 *    否則跑步或下樓梯都會誤觸。
 */

export type ShakePermission = 'unsupported' | 'prompt' | 'granted' | 'denied'

/** 單次「甩動」的加速度變化門檻（m/s²）。走路約 1-3，用力甩約 20 以上。 */
const SHAKE_THRESHOLD = 18

/** 需要在這段時間內累積足夠次數才算數 */
const WINDOW_MS = 3000

/** 視窗內要累積幾次甩動。設 12 次約等於持續用力搖三秒。 */
const REQUIRED_SHAKES = 12

/** 兩次計數之間的最小間隔，避免單一次甩動被連續取樣重複計算 */
const DEBOUNCE_MS = 120

interface DeviceMotionEventiOS extends DeviceMotionEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

interface Ctor {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export function useShakeDetection(enabled: boolean, onShake: () => void) {
  const [permission, setPermission] = useState<ShakePermission>('prompt')
  const timestampsRef = useRef<number[]>([])
  const lastCountedRef = useRef(0)
  const lastAccelRef = useRef<{ x: number; y: number; z: number } | null>(null)
  // 用 ref 存回呼，事件監聽器才不必因為回呼變動而重掛。
  // 在 effect 裡更新而不是 render 期間 —— render 期間寫 ref 會讓
  // React 無法保證與實際提交的畫面一致。
  const onShakeRef = useRef(onShake)
  useEffect(() => {
    onShakeRef.current = onShake
  }, [onShake])

  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      queueMicrotask(() => setPermission('unsupported'))
    }
  }, [])

  /** iOS 13+ 必須在使用者手勢中呼叫，否則直接被拒。 */
  const requestPermission = useCallback(async (): Promise<ShakePermission> => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      setPermission('unsupported')
      return 'unsupported'
    }
    const ctor = window.DeviceMotionEvent as unknown as Ctor
    if (typeof ctor.requestPermission !== 'function') {
      // Android / 桌面版不需要授權
      setPermission('granted')
      return 'granted'
    }
    try {
      const result = await ctor.requestPermission()
      const next: ShakePermission = result === 'granted' ? 'granted' : 'denied'
      setPermission(next)
      return next
    } catch {
      setPermission('denied')
      return 'denied'
    }
  }, [])

  useEffect(() => {
    if (!enabled || permission !== 'granted') return
    if (typeof window === 'undefined') return

    const handler = (e: DeviceMotionEventiOS) => {
      const a = e.accelerationIncludingGravity
      if (!a || a.x == null || a.y == null || a.z == null) return

      const prev = lastAccelRef.current
      lastAccelRef.current = { x: a.x, y: a.y, z: a.z }
      if (!prev) return

      // 用「與前一次取樣的差值」而不是絕對值：絕對值一直含重力 9.8，
      // 手機靜置擺法不同就會有固定偏差，差值才反映實際晃動強度。
      const delta =
        Math.abs(a.x - prev.x) + Math.abs(a.y - prev.y) + Math.abs(a.z - prev.z)
      if (delta < SHAKE_THRESHOLD) return

      const now = Date.now()
      if (now - lastCountedRef.current < DEBOUNCE_MS) return
      lastCountedRef.current = now

      const recent = timestampsRef.current.filter(t => now - t < WINDOW_MS)
      recent.push(now)
      timestampsRef.current = recent

      if (recent.length >= REQUIRED_SHAKES) {
        timestampsRef.current = []
        onShakeRef.current()
      }
    }

    window.addEventListener('devicemotion', handler)
    return () => window.removeEventListener('devicemotion', handler)
  }, [enabled, permission])

  return { permission, requestPermission }
}
