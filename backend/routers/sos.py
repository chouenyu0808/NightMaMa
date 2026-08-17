"""POST /sos — trigger emergency flow: write Firestore state, publish Pub/Sub event.

Firestore write and Pub/Sub publish are decoupled on purpose: notification
delivery (Telegram/LINE) can be slow or fail without blocking the user's SOS
request from being accepted. See backend-architecture.md section 6.2.
"""
from fastapi import APIRouter, Depends, status
from google.cloud import firestore, pubsub_v1

from clients import firestore_client
from deps import get_firestore, get_publisher
from models.schemas import SOSRequest
from services import sos_service

router = APIRouter()


@router.post("/sos", status_code=status.HTTP_202_ACCEPTED)
def trigger_sos(
    req: SOSRequest,
    db: firestore.Client = Depends(get_firestore),
    publisher: pubsub_v1.PublisherClient = Depends(get_publisher),
) -> dict:
    firestore_client.set_session_status(
        db, req.user_id, session_id=req.session_id, status="sos", lat=req.lat, lng=req.lng
    )
    sos_service.publish_sos(publisher, req)
    return {"status": "accepted"}
