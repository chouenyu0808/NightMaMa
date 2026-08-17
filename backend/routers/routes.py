"""POST /routes — candidate routes ranked by segment-based safety score."""
from fastapi import APIRouter, Depends
from google.cloud import bigquery, firestore

from clients import firestore_client, maps_client
from deps import get_bigquery, get_firestore
from models.schemas import LatLng, RouteOption, RouteRequest, RoutesResponse, WeightOverrides
from services import bigquery_service, places_service
from services.safety_scorer import Segment, Weights, score_route
from utils import geo

router = APIRouter()

MAX_SAMPLES_PER_ROUTE = 6  # ponytail: caps BigQuery/Places calls per route; raise if scoring feels too coarse


def _weights_from(overrides: WeightOverrides) -> Weights:
    return Weights(
        light=overrides.light, camera=overrides.camera, store=overrides.store,
        police=overrides.police, time=overrides.time,
    )


def _segments_for_route(bq: bigquery.Client, sampled_points: list[LatLng]) -> list[Segment]:
    segments = []
    for a, b in zip(sampled_points, sampled_points[1:]):
        segments.append(
            Segment(
                length_m=geo.haversine_m(a, b),
                light_count=bigquery_service.count_streetlights(bq, a.lat, a.lng),
                camera_count=bigquery_service.count_cameras(bq, a.lat, a.lng),
                store_count=places_service.count_24h_stores(a),
                police_count=places_service.count_police_stations(a),
            )
        )
    return segments


@router.post("/routes", response_model=RoutesResponse)
def get_routes(
    req: RouteRequest,
    bq: bigquery.Client = Depends(get_bigquery),
    db: firestore.Client = Depends(get_firestore),
) -> RoutesResponse:
    weights = _weights_from(req.weight_overrides or firestore_client.get_weight_overrides(db, user_id=None))

    raw_routes = maps_client.compute_routes(req.origin, req.destination)
    if not raw_routes:
        return RoutesResponse(routes=[])
    fastest_duration_s = min(float(r["duration"].rstrip("s")) for r in raw_routes)

    options: list[RouteOption] = []
    for raw in raw_routes:
        duration_s = float(raw["duration"].rstrip("s"))
        points = geo.decode_polyline(raw["polyline"]["encodedPolyline"])
        sampled = geo.sample_evenly(points, MAX_SAMPLES_PER_ROUTE)
        segments = _segments_for_route(bq, sampled)

        time_extra_min = max(0.0, (duration_s - fastest_duration_s) / 60)
        score = score_route(segments, time_extra_min, weights) if segments else 0.0

        light_count = sum(s.light_count for s in segments)
        camera_count = sum(s.camera_count for s in segments)
        police_count = sum(s.police_count for s in segments)

        options.append(
            RouteOption(
                duration_min=round(duration_s / 60, 1),
                distance_m=raw.get("distanceMeters", 0),
                score=round(score, 1),
                polyline=raw["polyline"]["encodedPolyline"],
                light_count=light_count,
                camera_count=camera_count,
                police_count=police_count,
            )
        )

    min(options, key=lambda o: o.duration_min).type = "fastest"
    max(options, key=lambda o: o.score).type = "safest"

    options.sort(key=lambda o: o.score, reverse=True)
    return RoutesResponse(routes=options)
