"""WS /stream/{user_id} — voice companion + location stream.

Client sends already-transcribed text (STT happens client-side or via a
separate audio pipe); this handles the companion reply and urgency-detection
loop, plus location updates. Real-time audio ingestion is out of scope here.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from clients import firestore_client
from deps import get_firestore
from services import gemini_service

router = APIRouter()


@router.websocket("/stream/{user_id}")
async def stream(websocket: WebSocket, user_id: str) -> None:
    await websocket.accept()
    try:
        while True:
            message = await websocket.receive_json()
            # ponytail: firestore/gemini calls below block the event loop;
            # wrap with starlette.concurrency.run_in_threadpool if WS latency
            # becomes noticeable under concurrent load
            session_id = message.get("session_id", "current")
            if message.get("type") == "location":
                # lazy: only chat-only sessions (no location pings) should never need GCP creds
                firestore_client.set_session_status(
                    get_firestore(), user_id, session_id=session_id, status="walking",
                    lat=message["lat"], lng=message["lng"],
                    current_segment=message.get("current_segment"),
                )
            elif message.get("type") == "speech":
                text = message.get("text", "")
                db = get_firestore()
                firestore_client.add_conversation_message(db, user_id, session_id, "user", text)
                if gemini_service.detect_urgent_tone(text):
                    reply_text = "偵測到危險語氣，是否需要協助？"
                    audio = gemini_service.synthesize_speech(reply_text, urgent=True)
                    firestore_client.add_conversation_message(db, user_id, session_id, "assistant", reply_text)
                    await websocket.send_json({"type": "urgent", "message": reply_text, "audio": audio})
                else:
                    reply_text = gemini_service.chat_reply(text)
                    audio = gemini_service.synthesize_speech(reply_text)
                    firestore_client.add_conversation_message(db, user_id, session_id, "assistant", reply_text)
                    await websocket.send_json({"type": "reply", "text": reply_text, "audio": audio})
    except WebSocketDisconnect:
        pass
