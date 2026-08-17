"""Thin wrapper around Google Maps Routes API (computeRoutes)."""
import httpx

from config import settings
from models.schemas import LatLng

ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


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
