"""Thin wrapper around the LINE Messaging API push endpoint.

Token 只從環境變數讀（config.settings），永遠不接受呼叫端傳入 —— 這支
client 的呼叫者是 Pub/Sub 推來的事件，不是可信任的來源。
"""
import re

import httpx

from config import settings

PUSH_URL = "https://api.line.me/v2/bot/message/push"

# LINE User ID 格式：U + 32 個十六進位字元。
# 前端 /api/line-notify 也用同一組規則，兩邊要一起改。
LINE_USER_ID_PATTERN = re.compile(r"^U[0-9a-f]{32}$", re.IGNORECASE)

# LINE 單則文字訊息上限 5000 字，這裡留餘裕。
MAX_TEXT_LENGTH = 2000


class LinePushError(RuntimeError):
    """Push 失敗。往上拋讓 Pub/Sub 重試，不要吞掉 —— 未送達的通知等於沒 SOS。"""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(f"LINE push failed (HTTP {status_code})")
        self.status_code = status_code
        self.detail = detail

    @property
    def retryable(self) -> bool:
        """4xx 是請求本身有問題，重試幾次都一樣；5xx 與 429 才值得重試。"""
        return self.status_code == 429 or self.status_code >= 500


def is_valid_user_id(user_id: str | None) -> bool:
    return bool(user_id and LINE_USER_ID_PATTERN.match(user_id.strip()))


def text_message(text: str) -> dict:
    return {"type": "text", "text": text[:MAX_TEXT_LENGTH]}


def location_message(title: str, address: str, lat: float, lng: float) -> dict:
    """地圖卡片。比把 maps.google.com 連結塞進文字好：聯絡人點一下直接開導航。

    title / address 都是 LINE 規格的必填欄位，address 拿不到反向地理編碼時
    退回座標字串，不能留空。
    """
    return {
        "type": "location",
        "title": title[:100],
        "address": (address or f"{lat:.5f}, {lng:.5f}")[:100],
        "latitude": lat,
        "longitude": lng,
    }


def push(to: str, messages: list[dict], timeout: float = 10.0) -> None:
    """推播給單一收件人。單次最多 5 則訊息（LINE 限制）。"""
    if not settings.line_channel_access_token:
        raise LinePushError(503, "LINE_CHANNEL_ACCESS_TOKEN 未設定")

    resp = httpx.post(
        PUSH_URL,
        json={"to": to, "messages": messages[:5]},
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.line_channel_access_token}",
        },
        timeout=timeout,
    )
    if resp.status_code >= 400:
        # 只留狀態碼與 LINE 的錯誤說明進 log，不外流到任何回應主體
        raise LinePushError(resp.status_code, resp.text[:500])
