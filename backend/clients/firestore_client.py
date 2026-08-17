"""Firestore helpers for user preferences and session state."""
from google.cloud import firestore

from models.schemas import WeightOverrides


def get_weight_overrides(db: firestore.Client, user_id: str | None) -> WeightOverrides:
    if not user_id:
        return WeightOverrides()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        return WeightOverrides()
    prefs = (doc.to_dict() or {}).get("preferences", {}).get("weight_overrides")
    return WeightOverrides(**prefs) if prefs else WeightOverrides()


def set_session_status(
    db: firestore.Client, user_id: str, session_id: str, status: str, lat: float, lng: float
) -> None:
    db.collection("users").document(user_id).collection("sessions").document(session_id).set(
        {
            "status": status,
            "current_location": firestore.GeoPoint(lat, lng),
            "last_updated": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )
