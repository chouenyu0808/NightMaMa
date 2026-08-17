"""WS /stream/{user_id} — voice companion + location stream.

Client sends already-transcribed text (STT happens client-side or via a
separate audio pipe); this handles the companion reply and urgency-detection
loop, plus location updates. Real-time audio ingestion is out of scope here.
"""
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from google.cloud import firestore

from clients import firestore_client
from deps import get_firestore
from services import gemini_service

router = APIRouter()


@router.websocket("/stream/{user_id}")
async def stream(websocket: WebSocket, user_id: str, db: firestore.Client = Depends(get_firestore)) -> None:
    await websocket.accept()
    try:
        while True:
            message = await websocket.receive_json()
            # ponytail: firestore/gemini calls below block the event loop;
            # wrap with starlette.concurrency.run_in_threadpool if WS latency
            # becomes noticeable under concurrent load
            if message.get("type") == "location":
                firestore_client.set_session_status(
                    db, user_id, session_id="current", status="walking",
                    lat=message["lat"], lng=message["lng"],
                )
            elif message.get("type") == "speech":
                text = message.get("text", "")
                if gemini_service.detect_urgent_tone(text):
                    await websocket.send_json({"type": "urgent", "message": "偵測到危險語氣，是否需要協助？"})
                else:
                    await websocket.send_json({"type": "reply", "text": gemini_service.chat_reply(text)})
    except WebSocketDisconnect:
        pass
