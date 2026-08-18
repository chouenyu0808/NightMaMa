"""SOS 事件的發布端與消費端。

發布端（publish_sos）由 POST /sos 呼叫，只負責把事件丟上 Pub/Sub 就回。
消費端（notify_contacts）由 Pub/Sub push 回頭打 /internal/pubsub/sos 觸發，
負責讀聯絡人並推播 LINE。兩邊刻意分開，理由見 backend-architecture.md 6.2。
"""
import json
import logging
from datetime import datetime, timedelta, timezone

from google.cloud import firestore, pubsub_v1

from clients import firestore_client, line_client, maps_client
from config import settings
from models.schemas import SOSRequest

logger = logging.getLogger(__name__)

# 台北時間。Cloud Run 一律是 UTC，直接 strftime 會讓聯絡人看到差 8 小時的
# 觸發時間，在「他多久以前出事」這種判斷上是會誤導人的。
TAIPEI_TZ = timezone(timedelta(hours=8))


def publish_sos(publisher: pubsub_v1.PublisherClient, payload: SOSRequest) -> str:
    topic_path = publisher.topic_path(settings.gcp_project_id, settings.pubsub_topic_sos)
    future = publisher.publish(topic_path, json.dumps(payload.model_dump()).encode("utf-8"))
    return future.result(timeout=10)


def build_messages(payload: SOSRequest, user_name: str) -> list[dict]:
    """組出要推給聯絡人的 LINE 訊息：一則文字警報 + 一張地圖卡片。

    定位失敗時只送文字並明講「未取得位置」，不送地圖卡片 —— 附上一個
    錯誤或猜測的座標，比誠實說沒有位置更危險，會把救援引到錯的地方。
    """
    who = user_name or "你的聯絡人"
    triggered_at = datetime.now(TAIPEI_TZ).strftime("%Y/%m/%d %H:%M:%S")
    has_location = payload.lat is not None and payload.lng is not None

    lines = [
        "🚨 【NightMaMa 緊急求救警報】",
        f"{who} 在夜間步行時觸發了 SOS 緊急求救！",
        "",
    ]

    address = maps_client.reverse_geocode(payload.lat, payload.lng) if has_location else None

    if has_location:
        lines.append(f"📍 位置：{address}" if address else "📍 位置：見下方地圖")
        # 地圖卡片點不開時（例如在電腦版 LINE）還有這條連結可用
        lines.append(f"🗺️ https://maps.google.com/?q={payload.lat},{payload.lng}")
    else:
        lines.append("📍 定位失敗，未取得即時 GPS 位置")

    lines += [f"⏰ 觸發時間：{triggered_at}", "", "請立即嘗試聯繫確認對方是否平安！"]

    messages: list[dict] = [line_client.text_message("\n".join(lines))]
    if has_location:
        messages.append(
            line_client.location_message(
                title="SOS 觸發位置",
                address=address or "",
                lat=payload.lat,
                lng=payload.lng,
            )
        )
    return messages


def notify_contacts(db: firestore.Client, payload: SOSRequest) -> dict:
    """推播給該使用者「全部」已綁定 LINE 的緊急聯絡人。

    回傳 {"sent": n, "skipped": n, "failed": [...]}。任何一個聯絡人推播失敗
    且可重試時，呼叫端應回非 2xx 讓 Pub/Sub 重試整批 —— 重複收到求救訊息，
    遠比漏掉其中一個聯絡人來得能接受。
    """
    contacts = firestore_client.get_emergency_contacts(db, payload.user_id)
    if not contacts:
        logger.error("SOS user=%s 沒有任何緊急聯絡人，通知無法送出", payload.user_id)
        return {"sent": 0, "skipped": 0, "failed": [], "no_contacts": True}

    user_name = firestore_client.get_profile(db, payload.user_id).get("name", "")
    messages = build_messages(payload, user_name)

    sent, skipped, failed = 0, 0, []
    for contact in contacts:
        line_user_id = (contact.get("line_user_id") or "").strip()
        if not line_client.is_valid_user_id(line_user_id):
            # 只填了電話、還沒完成 LINE 綁定的聯絡人。不是錯誤，跳過即可。
            skipped += 1
            continue
        try:
            line_client.push(line_user_id, messages)
            sent += 1
        except line_client.LinePushError as exc:
            logger.error(
                "SOS user=%s 推播失敗 status=%s retryable=%s detail=%s",
                payload.user_id, exc.status_code, exc.retryable, exc.detail,
            )
            if exc.retryable:
                failed.append(line_user_id)

    if sent == 0 and skipped and not failed:
        logger.error("SOS user=%s 的聯絡人都沒完成 LINE 綁定，通知無法送出", payload.user_id)

    return {"sent": sent, "skipped": skipped, "failed": failed}
