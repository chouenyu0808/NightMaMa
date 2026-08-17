import InviteResult from '../_components/InviteResult'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>
}) {
  const { name } = await searchParams
  return (
    <InviteResult tone="success" title="綁定完成">
      {name ? <p style={{ margin: 0 }}><b>{name}</b>，你已成為緊急聯絡人。</p> : <p style={{ margin: 0 }}>你已成為緊急聯絡人。</p>}
      <p style={{ marginTop: 12 }}>
        對方觸發 SOS 或平安抵達時，你會直接在 LINE 收到通知。
      </p>
      <p style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
        若剛才沒有加入 NightMaMa 官方帳號好友，通知將無法送達 ——
        LINE 只允許推播給官方帳號的好友。請重新開啟邀請連結完成加入。
      </p>
    </InviteResult>
  )
}
