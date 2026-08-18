import base64
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from clients import line_client
from config import settings
from models.schemas import SOSRequest
from services import sos_service

BOUND = "U0123456789abcdef0123456789abcdef"
BOUND_2 = "Ufedcba9876543210fedcba9876543210"


@pytest.fixture(autouse=True)
def stub_reverse_geocode(monkeypatch):
    """反向地理編碼會打 Google Geocoding API，測試裡一律擋掉。"""
    monkeypatch.setattr(sos_service.maps_client, "reverse_geocode", lambda lat, lng: "台北市信義區市府路1號")


class FakeDoc:
    def __init__(self, data):
        self._data = data

    def to_dict(self):
        return self._data

    @property
    def exists(self):
        return self._data is not None


class FakeDb:
    """只夠 firestore_client 的 users/{id} 讀取用的假 Firestore。"""

    def __init__(self, user_doc):
        self._user_doc = user_doc

    def collection(self, _name):
        return self

    def document(self, _id):
        return self

    def get(self):
        return FakeDoc(self._user_doc)


# ─── 訊息組裝 ────────────────────────────────────────────────────────────

def test_location_produces_text_plus_map_card():
    messages = sos_service.build_messages(
        SOSRequest(user_id="u1", lat=25.0498, lng=121.5773), user_name="小美"
    )

    assert [m["type"] for m in messages] == ["text", "location"]
    assert "小美" in messages[0]["text"]
    assert messages[1]["latitude"] == 25.0498
    assert messages[1]["longitude"] == 121.5773
    assert messages[1]["address"] == "台北市信義區市府路1號"


def test_missing_location_sends_text_only_and_says_so():
    """定位失敗時絕不送地圖卡片：指錯地方比誠實說沒有位置危險得多。"""
    messages = sos_service.build_messages(SOSRequest(user_id="u1"), user_name="小美")

    assert [m["type"] for m in messages] == ["text"]
    assert "定位失敗" in messages[0]["text"]


def test_triggered_at_uses_taipei_time():
    messages = sos_service.build_messages(
        SOSRequest(user_id="u1", lat=25.0, lng=121.5), user_name=""
    )
    # Cloud Run 跑在 UTC，時間直接 strftime 會差 8 小時
    from datetime import datetime

    today = datetime.now(sos_service.TAIPEI_TZ).strftime("%Y/%m/%d")
    assert today in messages[0]["text"]


# ─── 推播給全部聯絡人 ────────────────────────────────────────────────────

def test_notifies_every_bound_contact(monkeypatch):
    """舊的前端路徑只通知第一個聯絡人；這裡要確認三個都收到。"""
    pushed = []
    monkeypatch.setattr(line_client, "push", lambda to, messages: pushed.append(to))

    db = FakeDb(
        {
            "profile": {"name": "小美"},
            "emergency_contacts": [
                {"name": "媽媽", "line_user_id": BOUND},
                {"name": "室友", "line_user_id": BOUND_2},
                {"name": "只填電話", "phone": "0912345678", "line_user_id": ""},
            ],
        }
    )

    result = sos_service.notify_contacts(db, SOSRequest(user_id="u1", lat=25.0, lng=121.5))

    assert pushed == [BOUND, BOUND_2]
    assert result["sent"] == 2
    assert result["skipped"] == 1
    assert result["failed"] == []


def test_retryable_push_failure_is_reported_for_retry(monkeypatch):
    def boom(to, messages):
        raise line_client.LinePushError(503, "LINE down")

    monkeypatch.setattr(line_client, "push", boom)
    db = FakeDb({"emergency_contacts": [{"name": "媽媽", "line_user_id": BOUND}]})

    result = sos_service.notify_contacts(db, SOSRequest(user_id="u1", lat=25.0, lng=121.5))

    assert result["failed"] == [BOUND]


def test_permanent_push_failure_is_not_retried(monkeypatch):
    """400 是請求本身有問題（例如收件人已封鎖官方帳號），重試沒有意義。"""
    def boom(to, messages):
        raise line_client.LinePushError(400, "invalid recipient")

    monkeypatch.setattr(line_client, "push", boom)
    db = FakeDb({"emergency_contacts": [{"name": "媽媽", "line_user_id": BOUND}]})

    result = sos_service.notify_contacts(db, SOSRequest(user_id="u1", lat=25.0, lng=121.5))

    assert result["sent"] == 0
    assert result["failed"] == []


# ─── Pub/Sub push 端點的驗證 ─────────────────────────────────────────────

def _envelope(payload: dict, message_id: str = "m1") -> dict:
    data = base64.b64encode(json.dumps(payload).encode()).decode()
    return {"message": {"data": data, "messageId": message_id}, "subscription": "sub"}


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    import main
    from deps import get_firestore

    # FastAPI 在進 handler 前就會解析 Depends，而真的 Firestore client 需要
    # ADC。這裡的三個測試只驗證「請求有沒有被擋下來」，根本走不到 db。
    main.app.dependency_overrides[get_firestore] = lambda: FakeDb({})
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def test_push_endpoint_rejects_when_auth_not_configured(client, monkeypatch):
    """設定不全時 fail closed —— 這支端點會發 LINE 訊息，不能開著給任何人打。"""
    monkeypatch.setattr(settings, "pubsub_push_audience", "")
    monkeypatch.setattr(settings, "pubsub_push_sa_email", "")

    res = client.post("/internal/pubsub/sos", json=_envelope({"user_id": "u1"}))

    assert res.status_code == 503


def test_push_endpoint_rejects_missing_token(client, monkeypatch):
    monkeypatch.setattr(settings, "pubsub_push_audience", "https://api.example.com")
    monkeypatch.setattr(settings, "pubsub_push_sa_email", "pubsub@example.iam.gserviceaccount.com")

    res = client.post("/internal/pubsub/sos", json=_envelope({"user_id": "u1"}))

    assert res.status_code == 401


def test_push_endpoint_rejects_wrong_service_account(client, monkeypatch):
    monkeypatch.setattr(settings, "pubsub_push_audience", "https://api.example.com")
    monkeypatch.setattr(settings, "pubsub_push_sa_email", "pubsub@example.iam.gserviceaccount.com")
    monkeypatch.setattr(
        "routers.sos.id_token.verify_oauth2_token",
        lambda token, request, audience: {"email_verified": True, "email": "attacker@evil.com"},
    )

    res = client.post(
        "/internal/pubsub/sos",
        json=_envelope({"user_id": "u1"}),
        headers={"Authorization": "Bearer whatever"},
    )

    assert res.status_code == 403
