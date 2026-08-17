import InviteResult from '../_components/InviteResult'

export default function Page() {
  return (
    <InviteResult tone="warn" title="已取消授權">
      <p style={{ margin: 0 }}>你取消了 LINE 授權，因此沒有完成綁定。</p>
      <p style={{ marginTop: 12 }}>如果是誤觸，重新開啟邀請連結即可再試一次。</p>
    </InviteResult>
  )
}
