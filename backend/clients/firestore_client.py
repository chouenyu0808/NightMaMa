"""Firestore helpers for user preferences and session state."""
from google.cloud import firestore


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
