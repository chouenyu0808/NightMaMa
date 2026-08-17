"""Google Places API (New) — nearby 24hr store locations / police station count around a point."""
import httpx

from config import settings
from models.schemas import LatLng

NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"

# ponytail: httpx.post() opens a fresh TCP+TLS connection per call; reusing one
# client lets concurrent requests share a connection pool (keep-alive) instead
# of every one of the ~30 parallel Places calls paying its own handshake.
_client = httpx.Client(timeout=10)


def _search_nearby(point: LatLng, included_type: str, radius_m: float, field_mask: str) -> list[dict]:
    body = {
        "includedTypes": [included_type],
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
        "X-Goog-FieldMask": field_mask,
    }
    resp = _client.post(NEARBY_URL, json=body, headers=headers)
    resp.raise_for_status()
    return resp.json().get("places", [])


def list_24h_stores(point: LatLng, radius_m: float = 100) -> list[LatLng]:
    """Open-now convenience stores in the circle, as locations — callers derive nearest-distance per segment from this."""
    places = _search_nearby(point, "convenience_store", radius_m, "places.currentOpeningHours.openNow,places.location")
    return [
        LatLng(lat=p["location"]["latitude"], lng=p["location"]["longitude"])
        for p in places
        if p.get("currentOpeningHours", {}).get("openNow") and p.get("location")
    ]


def count_police_stations(point: LatLng, radius_m: float = 150) -> int:
    # ponytail: no openNow filter — police stations aren't tagged with hours in Places data
    return len(_search_nearby(point, "police", radius_m, "places.id"))
