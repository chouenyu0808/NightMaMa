"""POST /routes — candidate routes ranked by segment-based safety score."""
from fastapi import APIRouter, Depends
from google.cloud import bigquery, firestore

from clients import firestore_client, maps_client
from deps import get_bigquery, get_firestore
from models.schemas import RouteOption, RouteRequest, RoutesResponse
from services import route_scoring

router = APIRouter()


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

    polylines = [raw["polyline"]["encodedPolyline"] for raw in raw_routes]
    scored = route_scoring.score_polylines(bq, polylines, weights=weights)

    options: list[RouteOption] = []
    for raw, s in zip(raw_routes, scored):
        duration_s = float(raw["duration"].rstrip("s"))
        options.append(
            RouteOption(
                duration_min=round(duration_s / 60, 1),
                distance_m=raw.get("distanceMeters", 0),
                score=s.score,
                polyline=raw["polyline"]["encodedPolyline"],
                light_count=s.light_count,
                camera_count=s.camera_count,
                police_count=s.police_count,
                store_count=s.store_count,
                segment_scores=s.segment_scores,
            )
        )

    # Label fastest first, then safest. When one route is both, "safest" wins the
    # label and no route is tagged "fastest" — assigning both to one option would
    # be misleading, and the frontend already merges that case into a single card.
    fastest = min(options, key=lambda o: o.duration_min)
    safest = max(options, key=lambda o: o.score)
    fastest.type = "fastest"
    safest.type = "safest"

    options.sort(key=lambda o: o.score, reverse=True)
    return RoutesResponse(routes=options)
