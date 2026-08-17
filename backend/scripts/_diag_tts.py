"""Diagnostic: does the current synthesize_speech prompt cause the model to
read the style directive aloud (a known Gemini TTS failure mode)? Verify by
feeding the generated audio back into a Gemini multimodal model and asking
for a literal transcript. Delete after use.
"""
import sys
import os
import base64

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import settings  # noqa: E402
from google import genai  # noqa: E402
from services.gemini_service import synthesize_speech  # noqa: E402

text = "嗨，我是 NightMaMa，我會一路陪你走回家。"
audio_b64 = synthesize_speech(text)  # current (unfixed) implementation
audio_bytes = base64.b64decode(audio_b64)

client = genai.Client(api_key=settings.gemini_api_key)
interaction = client.interactions.create(
    model="gemini-3.7-flash",
    input=[
        {
            "type": "user_input",
            "content": [
                {"type": "text", "text": "請逐字轉錄這段音訊說了什麼，不要加任何說明，只給轉錄文字。"},
                {"type": "audio", "data": base64.b64encode(audio_bytes).decode("ascii"), "mime_type": "audio/wav"},
            ],
        }
    ],
)
print("預期文字:", text)
print("實際轉錄:", interaction.output_text.strip())
