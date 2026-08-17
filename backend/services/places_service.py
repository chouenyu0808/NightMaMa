"""Google Places API (New) — nearby 24hr / open-now store count around a point."""
import httpx

from config import settings
from models.schemas import LatLng

NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"


def count_24h_stores(point: LatLng, radius_m: float = 100) -> int:
    body = {
        "includedTypes": ["convenience_store"],
        "maxResultCount": 20,
        "locationRestriction": {
            "circle": {
                "center": {"latitude": point.lat, "longitude": point.lng},
                "radius": radius_m,
            }
        },
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": "places.currentOpeningHours.openNow",
    }
    resp = httpx.post(NEARBY_URL, json=body, headers=headers, timeout=10)
    resp.raise_for_status()
    places = resp.json().get("places", [])
    return sum(1 for p in places if p.get("currentOpeningHours", {}).get("openNow"))
