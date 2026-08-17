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


def sample_by_distance(points: list[LatLng], spacing_m: float = 75) -> list[LatLng]:
    """Walk the polyline and keep a point every `spacing_m`, so segment length stays
    roughly constant regardless of route length (index-based sampling doesn't: a long
    route would get a handful of huge segments instead of many short, checkable ones)."""
    if len(points) < 2:
        return points
    sampled = [points[0]]
    accumulated = 0.0
    for a, b in zip(points, points[1:]):
        accumulated += haversine_m(a, b)
        if accumulated >= spacing_m:
            sampled.append(b)
            accumulated = 0.0
    if sampled[-1] is not points[-1]:
        sampled.append(points[-1])
    return sampled


def midpoint(a: LatLng, b: LatLng) -> LatLng:
    """Simple lat/lng average — segments are short (~75m) so geodesic precision doesn't matter here."""
    return LatLng(lat=(a.lat + b.lat) / 2, lng=(a.lng + b.lng) / 2)


def covering_circle(points: list[LatLng], buffer_m: float = 150) -> tuple[LatLng, float]:
    """Centroid + radius that covers every point, for one Places search per route
    instead of one per sample point (Places has no batch/multi-point search)."""
    center = LatLng(lat=sum(p.lat for p in points) / len(points), lng=sum(p.lng for p in points) / len(points))
    radius = max(haversine_m(center, p) for p in points) + buffer_m
    return center, radius
