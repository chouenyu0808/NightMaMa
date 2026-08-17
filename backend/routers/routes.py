"""POST /routes — candidate routes ranked by segment-based safety score."""
import concurrent.futures

from fastapi import APIRouter, Depends
from google.cloud import bigquery, firestore

from clients import firestore_client, maps_client
from deps import get_bigquery, get_firestore
from models.schemas import LatLng, RouteOption, RouteRequest, RoutesResponse, WeightOverrides
from services import bigquery_service, places_service
from services.safety_scorer import Segment, Weights, score_route, score_segment_scaled
from utils import geo

router = APIRouter()

MAX_SAMPLES_PER_ROUTE = 6  # ponytail: caps BigQuery/Places calls per route; raise if scoring feels too coarse

MAX_WORKERS = 32


def _weights_from(overrides: WeightOverrides) -> Weights:
    return Weights(
        light=overrides.light, camera=overrides.camera, store=overrides.store,
        police=overrides.police, time=overrides.time,
    )


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

    route_lengths: list[list[float]] = []
    all_points: list[LatLng] = []
    route_circles: list[tuple[LatLng, float]] = []
    for raw in raw_routes:
        points = geo.decode_polyline(raw["polyline"]["encodedPolyline"])
        sampled = geo.sample_evenly(points, MAX_SAMPLES_PER_ROUTE)
        pairs = list(zip(sampled, sampled[1:]))
        route_lengths.append([geo.haversine_m(a, b) for a, b in pairs])
        all_points.extend(a for a, _ in pairs)
        route_circles.append(geo.covering_circle(sampled))

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        lights_future = pool.submit(bigquery_service.count_streetlights_batch, bq, all_points)
        cameras_future = pool.submit(bigquery_service.count_cameras_batch, bq, all_points)
        store_futures = [pool.submit(places_service.count_24h_stores, c, r) for c, r in route_circles]
        police_futures = [pool.submit(places_service.count_police_stations, c, r) for c, r in route_circles]

        light_counts = lights_future.result()
        camera_counts = cameras_future.result()
        route_store_totals = [f.result() for f in store_futures]
        route_police_totals = [f.result() for f in police_futures]

    per_route_segments: list[list[Segment]] = []
    idx = 0
    for lengths, store_total, police_total in zip(route_lengths, route_store_totals, route_police_totals):
        total_length_m = sum(lengths) or 1.0
        segments = []
        for length_m in lengths:
            share = length_m / total_length_m
            segments.append(
                Segment(
                    length_m=length_m,
                    light_count=light_counts[idx],
                    camera_count=camera_counts[idx],
                    store_count=store_total * share,
                    police_count=police_total * share,
                )
            )
            idx += 1
        per_route_segments.append(segments)

    options: list[RouteOption] = []
    for raw, segments in zip(raw_routes, per_route_segments):
        duration_s = float(raw["duration"].rstrip("s"))

        time_extra_min = max(0.0, (duration_s - fastest_duration_s) / 60)
        score = score_route(segments, time_extra_min, weights) if segments else 0.0

        light_count = sum(s.light_count for s in segments)
        camera_count = sum(s.camera_count for s in segments)
        # police_count is a proportional float split (see Segment) that sums back
        # to the original int Places total, modulo float error — round for the API.
        police_count = round(sum(s.police_count for s in segments))
        segment_scores = [round(score_segment_scaled(s, weights), 1) for s in segments]

        options.append(
            RouteOption(
                duration_min=round(duration_s / 60, 1),
                distance_m=raw.get("distanceMeters", 0),
                score=round(score, 1),
                polyline=raw["polyline"]["encodedPolyline"],
                light_count=light_count,
                camera_count=camera_count,
                police_count=police_count,
                segment_scores=segment_scores,
            )
        )

    min(options, key=lambda o: o.duration_min).type = "fastest"
    max(options, key=lambda o: o.score).type = "safest"

    options.sort(key=lambda o: o.score, reverse=True)
    return RoutesResponse(routes=options)
