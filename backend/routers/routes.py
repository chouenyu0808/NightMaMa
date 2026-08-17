"""POST /routes — candidate routes ranked by segment-based safety score."""
import concurrent.futures

from fastapi import APIRouter, Depends
from google.cloud import bigquery, firestore

from clients import firestore_client, maps_client
from deps import get_bigquery, get_firestore
from models.schemas import LatLng, RouteOption, RouteRequest, RoutesResponse
from services import bigquery_service, places_service
from services.safety_scorer import Segment, score_route, score_segment
from utils import geo

router = APIRouter()

SEGMENT_SPACING_M = 75  # ponytail: middle of the 50-100m range the safety model is designed around

MAX_WORKERS = 32


def _weights_from(overrides: dict[str, float] | None) -> dict[str, float]:
    """Convert user weight overrides to a dict; returns defaults if empty."""
    defaults = {"lighting": 0.40, "cctv": 0.25, "safe_haven": 0.35}
    if not overrides:
        return defaults
    merged = {**defaults, **overrides}
    return merged


@router.post("/routes", response_model=RoutesResponse)
def get_routes(
    req: RouteRequest,
    bq: bigquery.Client = Depends(get_bigquery),
    db: firestore.Client = Depends(get_firestore),
) -> RoutesResponse:
    weights = _weights_from(req.weight_overrides or firestore_client.get_weight_overrides(db, user_id=None))

    raw_routes = maps_client.compute_routes(req.origin, req.destination, waypoints=req.waypoints)
    if not raw_routes:
        return RoutesResponse(routes=[])

    route_lengths: list[list[float]] = []
    route_midpoints: list[list[LatLng]] = []
    all_midpoints: list[LatLng] = []
    route_circles: list[tuple[LatLng, float]] = []
    for raw in raw_routes:
        points = geo.decode_polyline(raw["polyline"]["encodedPolyline"])
        sampled = geo.sample_by_distance(points, SEGMENT_SPACING_M)
        pairs = list(zip(sampled, sampled[1:]))
        lengths = [geo.haversine_m(a, b) for a, b in pairs]
        midpoints = [geo.midpoint(a, b) for a, b in pairs]
        route_lengths.append(lengths)
        route_midpoints.append(midpoints)
        all_midpoints.extend(midpoints)
        route_circles.append(geo.covering_circle(sampled))

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        lights_future = pool.submit(bigquery_service.light_density_and_distance_batch, bq, all_midpoints)
        cameras_future = pool.submit(bigquery_service.camera_density_and_distance_batch, bq, all_midpoints)
        store_futures = [pool.submit(places_service.list_24h_stores, c, r) for c, r in route_circles]
        police_futures = [pool.submit(places_service.count_police_stations, c, r) for c, r in route_circles]

        light_counts, light_nearest = lights_future.result()
        camera_counts, camera_nearest = cameras_future.result()
        route_stores = [f.result() for f in store_futures]
        route_police_totals = [f.result() for f in police_futures]

    per_route_segments: list[list[Segment]] = []
    idx = 0
    for lengths, midpoints, stores in zip(route_lengths, route_midpoints, route_stores):
        segments = []
        for length_m, mid in zip(lengths, midpoints):
            store_nearest_m = min((geo.haversine_m(mid, s) for s in stores), default=9999.0)
            segments.append(
                Segment(
                    length_m=length_m,
                    light_count=light_counts[idx],
                    light_nearest_m=light_nearest[idx],
                    camera_count=camera_counts[idx],
                    camera_nearest_m=camera_nearest[idx],
                    store_nearest_m=store_nearest_m,
                )
            )
            idx += 1
        per_route_segments.append(segments)

    options: list[RouteOption] = []
    for raw, segments, police_total, stores in zip(raw_routes, per_route_segments, route_police_totals, route_stores):
        duration_s = float(raw["duration"].rstrip("s"))
        score = score_route(segments) if segments else 0.0

        light_count = sum(s.light_count for s in segments)
        camera_count = sum(s.camera_count for s in segments)
        segment_scores = [round(score_segment(s), 1) for s in segments]

        options.append(
            RouteOption(
                duration_min=round(duration_s / 60, 1),
                distance_m=raw.get("distanceMeters", 0),
                score=round(score, 1),
                polyline=raw["polyline"]["encodedPolyline"],
                light_count=light_count,
                camera_count=camera_count,
                police_count=police_total,
                store_count=len(stores),
                segment_scores=segment_scores,
            )
        )

    min(options, key=lambda o: o.duration_min).type = "fastest"
    max(options, key=lambda o: o.score).type = "safest"

    options.sort(key=lambda o: o.score, reverse=True)
    return RoutesResponse(routes=options)
