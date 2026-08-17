import InviteResult from '../_components/InviteResult'

export default function Page() {
  return (
    <InviteResult tone="error" title="綁定失敗">
      <p style={{ margin: 0 }}>與 LINE 或伺服器溝通時發生問題，綁定沒有完成。</p>
      <p style={{ marginTop: 12 }}>請稍後重新開啟邀請連結再試一次。</p>
    </InviteResult>
  )
}
