import InviteResult from '../_components/InviteResult'

export default function Page() {
  return (
    <InviteResult tone="error" title="邀請連結無效">
      <p style={{ margin: 0 }}>這個邀請連結已過期或格式不正確。</p>
      <p style={{ marginTop: 12 }}>
        邀請連結的有效期為 24 小時，請向邀請你的人索取新的連結。
      </p>
    </InviteResult>
  )
}
