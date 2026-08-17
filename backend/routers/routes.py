"""POST /routes — candidate routes ranked by segment-based safety score."""
from fastapi import APIRouter, Depends
from google.cloud import bigquery

from clients import maps_client
from deps import get_bigquery
from models.schemas import RouteOption, RouteRequest, RoutesResponse
from services import route_scoring

router = APIRouter()


@router.post("/routes", response_model=RoutesResponse)
def get_routes(req: RouteRequest, bq: bigquery.Client = Depends(get_bigquery)) -> RoutesResponse:
    raw_routes = maps_client.compute_routes(req.origin, req.destination)
    if not raw_routes:
        return RoutesResponse(routes=[])

    polylines = [raw["polyline"]["encodedPolyline"] for raw in raw_routes]
    scored = route_scoring.score_polylines(bq, polylines)

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
