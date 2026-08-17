"""Polyline decoding and geo distance helpers — no extra dependency needed for either."""
import math

from models.schemas import LatLng


def decode_polyline(encoded: str) -> list[LatLng]:
    """Decode a Google encoded polyline (standard algorithm) into lat/lng points."""
    points: list[LatLng] = []
    index = lat = lng = 0

    while index < len(encoded):
        for is_lat in (True, False):
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else (result >> 1)
            if is_lat:
                lat += delta
            else:
                lng += delta
        points.append(LatLng(lat=lat / 1e5, lng=lng / 1e5))
    return points


def haversine_m(a: LatLng, b: LatLng) -> float:
    """Great-circle distance between two points, in meters."""
    r = 6_371_000
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat = math.radians(b.lat - a.lat)
    dlng = math.radians(b.lng - a.lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def sample_evenly(points: list[LatLng], max_samples: int = 6) -> list[LatLng]:
    """Pick up to max_samples points spread evenly across the route (index-based, not distance-based)."""
    if len(points) <= max_samples:
        return points
    stride = len(points) / max_samples
    return [points[int(i * stride)] for i in range(max_samples)]


def covering_circle(points: list[LatLng], buffer_m: float = 150) -> tuple[LatLng, float]:
    """Centroid + radius that covers every point, for one Places search per route
    instead of one per sample point (Places has no batch/multi-point search)."""
    center = LatLng(lat=sum(p.lat for p in points) / len(points), lng=sum(p.lng for p in points) / len(points))
    radius = max(haversine_m(center, p) for p in points) + buffer_m
    return center, radius
