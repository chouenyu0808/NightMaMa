"""Seed Firestore with demo data for NightMaMa.

Run from backend/ directory:
    python scripts/seed_firestore.py
"""
import sys
import time
import uuid
from pathlib import Path

# Add backend/ to path so imports work
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from deps import get_firestore  # noqa: E402


def seed():
    db = get_firestore()
    print(f"Connected to Firestore project: {db.project}")
    print()

    # ─── 1. Demo User Profile ───────────────────────────────────────────
    demo_user_id = "demo-user-001"
    print(f"[1/4] Creating user profile: {demo_user_id}")
    db.collection("users").document(demo_user_id).set(
        {
            "profile": {"name": "小安", "phone": "0912345678"},
            "emergency_contacts": [
                {"id": "c1", "name": "媽媽", "line_user_id": ""},
                {"id": "c2", "name": "室友 Amy", "line_user_id": ""},
            ],
            "weight_overrides": {
                "lighting": 0.40,
                "cctv": 0.25,
                "safe_haven": 0.35,
            },
        },
        merge=True,
    )
    print("   ✓ Profile + contacts + weight_overrides written")

    # ─── 2. Demo Session (idle) ─────────────────────────────────────────
    print(f"[2/4] Creating demo session for {demo_user_id}")
    from google.cloud.firestore import GeoPoint, SERVER_TIMESTAMP

    db.collection("users").document(demo_user_id).collection("sessions").document("current").set(
        {
            "status": "idle",
            "current_location": GeoPoint(25.0478, 121.5170),
            "last_updated": SERVER_TIMESTAMP,
        }
    )
    print("   ✓ Session 'current' created (status: idle)")

    # ─── 3. Demo Reports (安全熱點地圖用) ────────────────────────────────
    print("[3/4] Creating demo anxiety reports (5 records)")
    demo_reports = [
        {"lat": 25.0335, "lng": 121.5650, "category": "路燈故障 / 巷弄極暗", "address": "信義區松仁路巷弄"},
        {"lat": 25.0420, "lng": 121.5080, "category": "疑似有人跟隨", "address": "中正區南昌路二段"},
        {"lat": 25.0510, "lng": 121.5440, "category": "異常聲響 / 可疑群聚", "address": "松山區八德路四段"},
        {"lat": 25.0260, "lng": 121.5430, "category": "感到不安 / 留存紀錄", "address": "大安區和平東路三段"},
        {"lat": 25.0580, "lng": 121.5220, "category": "路燈故障 / 巷弄極暗", "address": "中山區林森北路巷弄"},
    ]
    for report_data in demo_reports:
        report_id = str(uuid.uuid4())
        db.collection("reports").document(report_id).set(
            {
                "id": report_id,
                "user_id": demo_user_id,
                "lat": report_data["lat"],
                "lng": report_data["lng"],
                "category": report_data["category"],
                "address": report_data["address"],
                "timestamp": int(time.time() * 1000),
            }
        )
    print("   ✓ 5 demo reports written (台北各區)")

    # ─── 4. Demo Conversation History ───────────────────────────────────
    print(f"[4/4] Creating demo conversation for {demo_user_id}")
    messages = [
        ("user", "媽咪我剛下班要走回家"),
        ("assistant", "好的寶貝～路上小心，有什麼不對勁隨時跟我說喔！"),
        ("user", "這邊巷子好暗有點怕"),
        ("assistant", "我陪你，前面 50 公尺有全家便利商店，要不要先走過去那邊？"),
    ]
    session_ref = (
        db.collection("users")
        .document(demo_user_id)
        .collection("sessions")
        .document("current")
        .collection("messages")
    )
    for role, text in messages:
        session_ref.add(
            {
                "role": role,
                "text": text,
                "timestamp": SERVER_TIMESTAMP,
            }
        )
        time.sleep(0.1)  # slight delay so timestamps are ordered
    print("   ✓ 4 demo messages written")

    # ─── Done ────────────────────────────────────────────────────────────
    print()
    print("=" * 50)
    print("Seed complete! Your Firestore now has:")
    print(f"  • users/{demo_user_id} (profile + contacts)")
    print(f"  • users/{demo_user_id}/sessions/current (idle)")
    print(f"  • users/{demo_user_id}/sessions/current/messages (4 msgs)")
    print(f"  • reports/ (5 demo anxiety reports)")
    print("=" * 50)


if __name__ == "__main__":
    seed()
