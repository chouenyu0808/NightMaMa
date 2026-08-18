"""Thin wrapper around Google Maps Routes API (computeRoutes) and Geocoding API."""
import httpx

from config import settings
from models.schemas import LatLng

ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"


def compute_routes(
    origin: LatLng,
    destination: LatLng,
    alternatives: bool = True,
    waypoints: list[LatLng] | None = None,
) -> list[dict]:
    body = {
        "origin": {"location": {"latLng": {"latitude": origin.lat, "longitude": origin.lng}}},
        "destination": {"location": {"latLng": {"latitude": destination.lat, "longitude": destination.lng}}},
        "travelMode": "WALK",
        # waypoints disable alternative routes in the Routes API — a single
        # via-point route is what we want for "route through this store" asks
        "computeAlternativeRoutes": alternatives and not waypoints,
    }
    if waypoints:
        body["intermediates"] = [
            {"location": {"latLng": {"latitude": w.lat, "longitude": w.lng}}} for w in waypoints
        ]
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    }
    resp = httpx.post(ROUTES_URL, json=body, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json().get("routes", [])


def reverse_geocode(lat: float, lng: float, timeout: float = 5.0) -> str | None:
    """座標 → 中文門牌地址。查不到或出錯時回 None，由呼叫端決定怎麼退化。

    刻意不 raise：這是 SOS 通知的裝飾性欄位，Geocoding API 掛掉不該擋住
    求救訊息送出 —— 座標本身已經足以定位。
    """
    if not settings.google_maps_api_key:
        return None
    try:
        resp = httpx.get(
            GEOCODE_URL,
            params={
                "latlng": f"{lat},{lng}",
                "key": settings.google_maps_api_key,
                "language": "zh-TW",
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        return results[0].get("formatted_address") if results else None
    except (httpx.HTTPError, ValueError, KeyError, IndexError):
        return None
