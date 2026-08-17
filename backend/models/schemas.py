"""Pydantic request/response models shared across routers."""
from pydantic import BaseModel


class LatLng(BaseModel):
    lat: float
    lng: float


class RouteRequest(BaseModel):
    origin: LatLng
    destination: LatLng


class RouteOption(BaseModel):
    type: str = "balanced"
    duration_min: float
    distance_m: float = 0
    score: float
    polyline: str
    light_count: int = 0
    camera_count: int = 0
    police_count: int = 0
    store_count: int = 0
    segment_scores: list[float] = []


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


class ReportItem(BaseModel):
    id: str
    lat: float
    lng: float
    reason: str
    reported_at: str


class ReportsResponse(BaseModel):
    reports: list[ReportItem]


class SpeakRequest(BaseModel):
    text: str
    urgent: bool = False


class SpeakResponse(BaseModel):
    audio: str  # base64-encoded WAV, per Gemini TTS output_audio.data
