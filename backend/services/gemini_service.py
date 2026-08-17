"""Gemini wrapper — route reasoning text, voice-companion chat/urgency detection,
and natural-voice speech synthesis (replaces the browser's robotic
speechSynthesis on the frontend).

Uses the Interactions API (client.interactions.create), the current
recommended entry point — the older generate_content models are being
retired for new API keys.
"""
import base64
import struct

from google import genai

from config import settings

MODEL = "gemini-3.7-flash"
TTS_MODEL = "gemini-3.1-flash-tts-preview"
TTS_VOICE = "Achird"  # "Friendly" — warm, conversational tone fits a night-walk companion

_client: genai.Client | None = None


def _client_instance() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def chat_reply(user_text: str) -> str:
    prompt = f"你是夜間步行陪伴語音助理，簡短溫暖地回應（30字內、繁體中文）：{user_text}"
    interaction = _client_instance().interactions.create(model=MODEL, input=prompt)
    return interaction.output_text.strip()


def detect_urgent_tone(transcript: str) -> bool:
    # ponytail: keyword heuristic only; swap for prosody/audio-based tone model
    # if real usage shows false negatives (e.g. distress without trigger words)
    urgent_keywords = ("救命", "救我", "有人跟蹤", "危險", "help")
    return any(word in transcript for word in urgent_keywords)


def _pcm_to_wav_base64(pcm_b64: str, sample_rate: int = 24000, channels: int = 1, sample_width: int = 2) -> str:
    """Gemini TTS returns raw 16-bit PCM (audio/l16), not a WAV file — browsers'
    <audio> can't play headerless PCM, so we prepend a standard 44-byte WAV
    header before re-encoding to base64."""
    pcm = base64.b64decode(pcm_b64)
    byte_rate = sample_rate * channels * sample_width
    block_align = channels * sample_width
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + len(pcm), b"WAVE",
        b"fmt ", 16, 1, channels, sample_rate, byte_rate, block_align, sample_width * 8,
        b"data", len(pcm),
    )
    return base64.b64encode(header + pcm).decode("ascii")


def synthesize_speech(text: str, urgent: bool = False) -> str:
    """Turn text into natural-sounding speech, returned as base64-encoded WAV.

    Replaces the frontend's browser-native speechSynthesis (robotic-sounding)
    with Gemini's native TTS, which supports Mandarin (cmn) and steerable
    tone/pace via a plain-language directive prefixed to the transcript.
    """
    directive = (
        "用溫暖、沉穩、令人安心的語氣說出以下這句話（繁體中文）："
        if not urgent
        else "用關切、稍微加快但依然沉穩不驚慌的語氣說出以下這句話（繁體中文）："
    )
    interaction = _client_instance().interactions.create(
        model=TTS_MODEL,
        input=f"{directive}{text}",
        response_format={"type": "audio"},
        generation_config={"speech_config": [{"voice": TTS_VOICE}]},
    )
    return _pcm_to_wav_base64(interaction.output_audio.data)
