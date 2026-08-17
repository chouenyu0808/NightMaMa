"""POST /speak — text -> natural-voice audio (base64 WAV), via Gemini native TTS.

Lets the frontend synthesize any string (e.g. the hardcoded initial greeting)
without going through the /stream WebSocket chat loop.
"""
from fastapi import APIRouter

from models.schemas import SpeakRequest, SpeakResponse
from services import gemini_service

router = APIRouter()


@router.post("/speak", response_model=SpeakResponse)
def speak(req: SpeakRequest) -> SpeakResponse:
    audio = gemini_service.synthesize_speech(req.text, urgent=req.urgent)
    return SpeakResponse(audio=audio)
