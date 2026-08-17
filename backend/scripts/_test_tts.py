"""Temporary smoke test for gemini_service.synthesize_speech. Delete after use."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from services.gemini_service import synthesize_speech  # noqa: E402

try:
    audio_b64 = synthesize_speech("嗨，我是 NightMaMa，我會一路陪你走回家。")
    print("成功，base64 長度:", len(audio_b64))
except Exception as e:  # noqa: BLE001
    print("失敗:", repr(e))
