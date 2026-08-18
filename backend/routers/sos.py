"""SOS 觸發與非同步通知。

POST /sos                    使用者按下求救 → 寫 Firestore state、發 Pub/Sub 事件
POST /internal/pubsub/sos    Pub/Sub push subscription 回打 → 推播 LINE 給緊急聯絡人

Firestore 寫入與通知送出刻意解耦：LINE 可能逾時或失敗，不該讓使用者的 SOS
請求卡在那裡等。Pub/Sub 負責重試。詳見 backend-architecture.md 6.2。
"""
import base64
import binascii
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.cloud import firestore, pubsub_v1
from google.oauth2 import id_token
from pydantic import ValidationError

from clients import firestore_client, line_client
from config import settings
from deps import get_firestore, get_publisher
from models.schemas import SOSRequest
from services import sos_service

logger = logging.getLogger(__name__)
router = APIRouter()

# 驗證 OIDC token 用。內部會快取 Google 的公鑰，共用比每次新建省一次 HTTPS 往返。
_token_request = google_requests.Request()


@router.post("/sos", status_code=status.HTTP_202_ACCEPTED)
def trigger_sos(
    req: SOSRequest,
    db: firestore.Client = Depends(get_firestore),
    publisher: pubsub_v1.PublisherClient = Depends(get_publisher),
) -> dict:
    firestore_client.set_session_status(
        db, req.user_id, session_id=req.session_id, status="sos", lat=req.lat, lng=req.lng
    )

    # 同步數一下「這次真的會推播給幾個人」並回給前端。實際推播是非同步的，
    # 前端無從得知結果；至少要讓它能分辨「0 個收件人」這種必定靜默失敗的
    # 情況，改開 LINE 分享連結讓使用者手動送，而不是顯示一個假的成功畫面。
    recipients = sum(
        1
        for c in firestore_client.get_emergency_contacts(db, req.user_id)
        if line_client.is_valid_user_id(c.get("line_user_id"))
    )

    # publish 失敗不能靜靜吞掉 —— 通知沒送達等於沒 SOS。前端拿到 502 之後
    # 會退回「開 LINE 手動送出」，使用者至少還有辦法求救。
    try:
        sos_service.publish_sos(publisher, req)
    except Exception:
        logger.exception("SOS user=%s Pub/Sub publish 失敗，通知不會送出", req.user_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="求救狀態已記錄，但通知派送失敗，請改用其他方式聯繫",
        )

    if recipients == 0:
        logger.error("SOS user=%s 沒有任何已綁定 LINE 的聯絡人，通知不會有收件人", req.user_id)

    return {"status": "accepted", "recipients": recipients}


def _verify_pubsub_push(request: Request) -> None:
    """驗證這個請求真的來自我們自己的 Pub/Sub push subscription。

    後端是 --allow-unauthenticated，所以這支端點在公網上打得到。沒有這道
    驗證，任何人都能對著它送 JSON 把 LINE 訊息推給任意收件人。

    設定不全時一律拒絕（fail closed）：寧可通知送不出去被 log 抓到，也不要
    開一個誰都能用的免費推播閘道。
    """
    if not settings.pubsub_push_audience or not settings.pubsub_push_sa_email:
        logger.error(
            "PUBSUB_PUSH_AUDIENCE / PUBSUB_PUSH_SA_EMAIL 未設定，"
            "拒絕所有 Pub/Sub push 請求（SOS 通知不會送出）"
        )
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE)

    auth_header = request.headers.get("authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    try:
        claims = id_token.verify_oauth2_token(
            token, _token_request, audience=settings.pubsub_push_audience
        )
    except (GoogleAuthError, ValueError) as exc:
        logger.warning("Pub/Sub push OIDC 驗證失敗: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    if not claims.get("email_verified") or claims.get("email") != settings.pubsub_push_sa_email:
        logger.warning("Pub/Sub push 服務帳號不符: %s", claims.get("email"))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)


@router.post("/internal/pubsub/sos", include_in_schema=False)
async def consume_sos(
    request: Request, db: firestore.Client = Depends(get_firestore)
) -> Response:
    """Pub/Sub push 端點：讀出 SOS 事件 → 推播全部緊急聯絡人。

    回應碼決定 Pub/Sub 會不會重送：
      204 = ack（成功，或再送幾次也沒用的永久性失敗）
      5xx = nack，稍後重試
    """
    _verify_pubsub_push(request)

    try:
        envelope = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        logger.error("Pub/Sub push 的 body 不是 JSON，已丟棄")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    message = (envelope or {}).get("message") or {}
    message_id = message.get("messageId", "")

    try:
        raw = base64.b64decode(message.get("data", ""), validate=True)
        payload = SOSRequest(**json.loads(raw))
    except (binascii.Error, UnicodeDecodeError, json.JSONDecodeError, TypeError, ValidationError):
        # 內容壞掉，重送幾次都是一樣的結果 —— ack 掉，不要卡住整條訂閱。
        logger.exception("SOS 事件內容無法解析 messageId=%s，已丟棄", message_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    if message_id and _already_notified(db, message_id):
        logger.info("SOS messageId=%s 已通知過，略過重送", message_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    result = sos_service.notify_contacts(db, payload)

    if result["failed"]:
        # 有可重試的失敗 → 讓 Pub/Sub 重送整批。刻意不記 dedupe 標記，
        # 代價是已成功的聯絡人可能再收到一次；重複的求救訊息遠比漏掉好。
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{len(result['failed'])} 位聯絡人推播失敗，等待重試",
        )

    if message_id and result["sent"]:
        _mark_notified(db, message_id, payload.user_id, result["sent"])

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── 重送去重 ────────────────────────────────────────────────────────────
# Pub/Sub 是 at-least-once，同一則事件可能送兩次。標記刻意在「推播成功之後」
# 才寫：先寫的話，中途失敗的重試會被自己的標記擋掉，變成靜默漏送。反過來
# 的代價只是極窄的併發視窗裡可能重複推播一次。

_DEDUPE_COLLECTION = "sos_notifications"


def _already_notified(db: firestore.Client, message_id: str) -> bool:
    try:
        return db.collection(_DEDUPE_COLLECTION).document(message_id).get().exists
    except Exception:
        # 去重查詢失敗時當作沒通知過：重複通知可以接受，漏掉不行。
        logger.exception("SOS 去重查詢失敗 messageId=%s，照常推播", message_id)
        return False


def _mark_notified(db: firestore.Client, message_id: str, user_id: str, sent: int) -> None:
    try:
        db.collection(_DEDUPE_COLLECTION).document(message_id).set(
            {
                "user_id": user_id,
                "sent": sent,
                "notified_at": firestore.SERVER_TIMESTAMP,
            }
        )
    except Exception:
        logger.exception("SOS 去重標記寫入失敗 messageId=%s", message_id)
