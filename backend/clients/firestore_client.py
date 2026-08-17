"""Firestore helpers for user preferences, session state, profile,
emergency contacts, conversation history and reports."""
import time
import uuid

from google.cloud import firestore


def set_session_status(
    db: firestore.Client,
    user_id: str,
    session_id: str,
    status: str,
    lat: float,
    lng: float,
    current_segment: str | None = None,
) -> None:
    data = {
        "status": status,
        "current_location": firestore.GeoPoint(lat, lng),
        "last_updated": firestore.SERVER_TIMESTAMP,
    }
    if current_segment is not None:
        data["current_segment"] = current_segment
    db.collection("users").document(user_id).collection("sessions").document(session_id).set(
        data,
        merge=True,
    )


def get_session_status(db: firestore.Client, user_id: str, session_id: str = "current") -> dict:
    doc = db.collection("users").document(user_id).collection("sessions").document(session_id).get()
    if not doc.exists:
        return {}
    data = doc.to_dict() or {}
    loc = data.get("current_location")
    return {
        "status": data.get("status"),
        "current_segment": data.get("current_segment"),
        "lat": loc.latitude if loc else None,
        "lng": loc.longitude if loc else None,
    }


def get_profile(db: firestore.Client, user_id: str) -> dict:
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        return {"name": "", "phone": ""}
    data = (doc.to_dict() or {}).get("profile", {})
    return {"name": data.get("name", ""), "phone": data.get("phone", "")}


def set_profile(db: firestore.Client, user_id: str, name: str, phone: str) -> None:
    db.collection("users").document(user_id).set(
        {"profile": {"name": name, "phone": phone}},
        merge=True,
    )


def get_emergency_contacts(db: firestore.Client, user_id: str) -> list[dict]:
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        return []
    return (doc.to_dict() or {}).get("emergency_contacts", [])


def set_emergency_contacts(db: firestore.Client, user_id: str, contacts: list[dict]) -> None:
    db.collection("users").document(user_id).set(
        {"emergency_contacts": contacts},
        merge=True,
    )


def get_addresses(db: firestore.Client, user_id: str) -> dict:
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        return {"home": "", "work": ""}
    addresses = (doc.to_dict() or {}).get("addresses", {})
    return {"home": addresses.get("home", ""), "work": addresses.get("work", "")}


def set_addresses(db: firestore.Client, user_id: str, home: str, work: str) -> None:
    db.collection("users").document(user_id).set(
        {"addresses": {"home": home, "work": work}},
        merge=True,
    )


def add_conversation_message(
    db: firestore.Client, user_id: str, session_id: str, role: str, text: str
) -> None:
    db.collection("users").document(user_id).collection("sessions").document(
        session_id
    ).collection("messages").add(
        {
            "role": role,
            "text": text,
            "timestamp": firestore.SERVER_TIMESTAMP,
        }
    )


def get_conversation_history(
    db: firestore.Client, user_id: str, session_id: str, limit: int = 50
) -> list[dict]:
    docs = (
        db.collection("users")
        .document(user_id)
        .collection("sessions")
        .document(session_id)
        .collection("messages")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    messages = []
    for d in docs:
        data = d.to_dict() or {}
        ts = data.get("timestamp")
        messages.append(
            {
                "role": data.get("role", ""),
                "text": data.get("text", ""),
                "timestamp": int(ts.timestamp() * 1000) if ts else None,
            }
        )
    messages.reverse()
    return messages


def add_report(
    db: firestore.Client,
    lat: float,
    lng: float,
    category: str,
    address: str | None = None,
    user_id: str | None = None,
) -> dict:
    report_id = str(uuid.uuid4())
    timestamp = int(time.time() * 1000)
    record = {
        "id": report_id,
        "user_id": user_id,
        "lat": lat,
        "lng": lng,
        "category": category,
        "address": address,
        "timestamp": timestamp,
    }
    db.collection("reports").document(report_id).set(record)
    return record


def list_reports(db: firestore.Client, limit: int = 50) -> list[dict]:
    docs = (
        db.collection("reports")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    return [d.to_dict() or {} for d in docs]


def get_weight_overrides(db: firestore.Client, user_id: str | None) -> dict[str, float] | None:
    """Retrieve user-specific safety weight overrides from Firestore.
    Returns None if no overrides are stored."""
    if not user_id:
        return None
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        return None
    return (doc.to_dict() or {}).get("weight_overrides")
