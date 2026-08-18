/**
 * AI 陪伴助理可以呼叫的工具定義。
 *
 * 文字聊天（/api/companion）與語音通話（Gemini Live WS）共用同一份宣告，
 * 否則兩條路徑會慢慢長出不同的能力 —— 先前就是只有語音能規劃路線，
 * 文字聊天問「幫我找安全的路」AI 只會用講的。
 *
 * 型別刻意寫成 Gemini REST 的形狀（type 用大寫字串），兩邊都能直接送出。
 */

export interface FunctionDeclaration {
  name: string
  description: string
  parameters: {
    type: 'OBJECT'
    properties: Record<string, { type: string; description: string }>
    required?: string[]
  }
}

export const COMPANION_TOOLS: FunctionDeclaration[] = [
  {
    name: 'plan_safe_route',
    description:
      '規劃一條最安全、避開暗巷小巷子的步行路線到達目的地。當使用者要求「最安全的路線」、「不要走小巷子」時呼叫。',
    parameters: {
      type: 'OBJECT',
      properties: {
        destination: {
          type: 'STRING',
          description:
            '使用者這次訊息中明確說出的目的地，原樣填入，例如他說「回捷運松山站」就填「捷運松山站」。' +
            '只有在他完全沒提到地點時，才使用上下文中的既有目的地。',
        },
      },
      required: ['destination'],
    },
  },
  {
    name: 'plan_route_via_store',
    description:
      '規劃一條會先經過附近營業中的 24 小時超商，再前往目的地的步行路線。當使用者說路上想先買個東西、想找一條經過超商的路時呼叫。',
    parameters: {
      type: 'OBJECT',
      properties: {
        destination: {
          type: 'STRING',
          description:
            '使用者這次訊息中明確說出的最終目的地，原樣填入；沒提到才用上下文的既有目的地。',
        },
      },
      required: ['destination'],
    },
  },
  {
    name: 'find_lit_road_now',
    description:
      '緊急情況：立刻從使用者目前位置規劃一條路燈最多、最明亮的大馬路路線。當使用者表達害怕、附近很暗、緊張焦慮、要求快點帶他走到大馬路時呼叫。',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'trigger_emergency_alert',
    description:
      '把使用者的即時位置與求救訊息發送給緊急聯絡人。只有在使用者明確表達人身安全受到威脅時才呼叫，' +
      '例如：有人跟蹤我、有人抓我、我被跟了很久、快報警、幫我求救、我好害怕有人靠近。' +
      '單純的天色暗、路不熟、有點緊張不要呼叫這個，改用 find_lit_road_now。' +
      '呼叫後系統會顯示 5 秒倒數讓使用者有機會取消，因此不會造成無法挽回的誤報。',
    parameters: {
      type: 'OBJECT',
      properties: {
        reason: {
          type: 'STRING',
          description: '用一句話說明目前的危險狀況，會寫進發給緊急聯絡人的訊息，例如「有人一路跟蹤」',
        },
      },
      required: ['reason'],
    },
  },
]

/** Gemini REST generateContent 的 tools 欄位格式 */
export const COMPANION_TOOLS_PAYLOAD = [{ functionDeclarations: COMPANION_TOOLS }]
