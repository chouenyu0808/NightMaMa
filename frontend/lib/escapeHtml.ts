/**
 * Google Maps InfoWindow 只吃 HTML 字串，沒有 React 的自動跳脫，
 * 因此任何要塞進去的外部字串（使用者通報內容、Places 回傳的店名）
 * 都必須先經過這裡。
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch])
}
