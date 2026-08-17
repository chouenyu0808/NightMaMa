"""Pydantic request/response models shared across routers."""
from pydantic import BaseModel, Field


class LatLng(BaseModel):
    lat: float
    lng: float


# Mapping of scoring factor name to its weight (0.0–1.0)
WeightOverrides = dict[str, float]


class RouteRequest(BaseModel):
    origin: LatLng
    destination: LatLng
    weight_overrides: WeightOverrides | None = None
    waypoints: list[LatLng] | None = None


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


class ScoreRequest(BaseModel):
    """Encoded polylines the caller already planned and wants safety numbers for."""
    polylines: list[str]


class ScoredRouteItem(BaseModel):
    score: float
    light_count: int = 0
    camera_count: int = 0
    police_count: int = 0
    store_count: int = 0
    segment_scores: list[float] = []


class ScoreResponse(BaseModel):
    """Same order as the request's polylines."""
    scores: list[ScoredRouteItem]


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
    category: str | None = None
    address: str | None = None
    user_id: str | None = None


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


class EmergencyContact(BaseModel):
    id: str
    name: str
    phone: str = ""
    # 一般使用者拿不到自己的 LINE userId（個人資料頁上的是搜尋用 LINE ID），
    # 因此為選填；未綁定時前端改走 LINE 分享連結。
    line_user_id: str = ""


class EmergencyContactsRequest(BaseModel):
    contacts: list[EmergencyContact]


class BindContactRequest(BaseModel):
    """LINE Login 綁定完成後，把登入者加入邀請者的緊急聯絡人。"""
    name: str
    line_user_id: str
    phone: str = ""


class UserProfile(BaseModel):
    name: str = ""
    phone: str = ""


class ConversationMessage(BaseModel):
    role: str
    text: str
    timestamp: int | None = None


class ReportRecord(BaseModel):
    id: str
    user_id: str | None = None
    lat: float
    lng: float
    category: str
    address: str | None = None
    timestamp: int


class ReportListResponse(BaseModel):
    reports: list[ReportRecord]


class ConversationHistoryResponse(BaseModel):
    messages: list[ConversationMessage]


class NearestStoreResponse(BaseModel):
    found: bool
    name: str | None = None
    lat: float | None = None
    lng: float | None = None


class SavedAddresses(BaseModel):
    home: str = ""
    work: str = ""


class RouteRatingRequest(BaseModel):
    """抵達後對這條路線的主觀安全評價。"""
    origin: str = ""
    destination: str = ""
    # 1 = 很不安, 5 = 很安心
    rating: int = Field(ge=1, le=5)
    route_type: str = ""
    # 當下演算法算出的分數，用來比對主觀感受與客觀評分的落差
    safety_score: float | None = None
    distance_m: int = 0


class RouteRatingItem(RouteRatingRequest):
    id: str
    rated_at: int | None = None


class RouteRatingsResponse(BaseModel):
    ratings: list[RouteRatingItem]
