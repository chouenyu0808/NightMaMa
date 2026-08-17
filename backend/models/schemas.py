"""Pydantic request/response models shared across routers."""
from pydantic import BaseModel


class LatLng(BaseModel):
    lat: float
    lng: float


class WeightOverrides(BaseModel):
    light: float = 1
    camera: float = 1
    store: float = 1
    police: float = 1
    time: float = 1


class RouteRequest(BaseModel):
    origin: LatLng
    destination: LatLng
    weight_overrides: WeightOverrides | None = None


class RouteOption(BaseModel):
    type: str = "balanced"
    duration_min: float
    distance_m: float = 0
    score: float
    polyline: str
    light_count: int = 0
    camera_count: int = 0
    police_count: int = 0


class RoutesResponse(BaseModel):
    routes: list[RouteOption]


class SOSRequest(BaseModel):
    user_id: str
    session_id: str = "current"
    lat: float
    lng: float
    safety_score: float | None = None


class ReportRequest(BaseModel):
    session_id: str
    lat: float
    lng: float
    reason: str


class SpeakRequest(BaseModel):
    text: str
    urgent: bool = False


class SpeakResponse(BaseModel):
    audio: str  # base64-encoded WAV, per Gemini TTS output_audio.data
