"""Gemini wrapper — route reasoning text and voice-companion chat/urgency detection."""
from google import genai

from config import settings

_client: genai.Client | None = None


def _client_instance() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def explain_route_choice(light_count: int, store_count: int, camera_count: int) -> str:
    prompt = (
        "用一句話（20字內、繁體中文）說明為什麼這條路線比較安全："
        f"沿途路燈 {light_count} 盞、24H店家 {store_count} 家、監視器 {camera_count} 個。"
    )
    response = _client_instance().models.generate_content(model="gemini-2.5-flash", contents=prompt)
    return response.text.strip()


def chat_reply(user_text: str) -> str:
    prompt = f"你是夜間步行陪伴語音助理，簡短溫暖地回應（30字內、繁體中文）：{user_text}"
    response = _client_instance().models.generate_content(model="gemini-2.5-flash", contents=prompt)
    return response.text.strip()


def detect_urgent_tone(transcript: str) -> bool:
    # ponytail: keyword heuristic only; swap for prosody/audio-based tone model
    # if real usage shows false negatives (e.g. distress without trigger words)
    urgent_keywords = ("救命", "救我", "有人跟蹤", "危險", "help")
    return any(word in transcript for word in urgent_keywords)
