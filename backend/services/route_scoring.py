"""Shared scoring pipeline: encoded polyline -> real Lighting/CCTV/Safe-Haven score.

Extracted from routers/routes.py so that both endpoints can reuse it:

- POST /routes  — backend computes its own walking routes, then scores them.
- POST /score   — frontend supplies polylines it already got from the Google
                  Directions JS SDK (which also gives it turn-by-turn steps and
                  transit legs the Routes API response here does not carry), and
                  only asks for the safety numbers.

Both paths run the identical BigQuery + Places lookups and the identical
safety_scorer maths, so a route scores the same no matter which one produced it.
"""
import concurrent.futures
import logging
from dataclasses import dataclass

from google.cloud import bigquery

from models.schemas import LatLng
from services import bigquery_service, places_service
from services.safety_scorer import (
    Segment,
    openness_score,
    reports_score,
    score_route,
    score_segment,
)
from utils import geo

# Middle of the 50-100m range the safety model is designed around.
SEGMENT_SPACING_M = 75

MAX_WORKERS = 32

logger = logging.getLogger(__name__)


def _safe_batch(future, length: int, fallback):
    """取回批次查詢結果；失敗就回傳等長的中性值。

    新增的路網與通報資料表是選用的：專案若還沒匯入 OSM 資料，這幾個查詢會
    因為找不到資料表而丟例外。那不該讓整條路線變成無法評分 —— 退回中性值，
    其餘四項照常計分。
    """
    try:
        result = future.result()
        if len(result) == length:
            return result
    except Exception as exc:  # noqa: BLE001 - 缺資料表是預期情況，記錄後降級
        logger.warning("選用的評分資料來源不可用，改用中性值: %s", exc)
    return [fallback] * length


@dataclass
class ScoredRoute:
    """Safety numbers for one route. Geometry/duration stay with the caller."""
    score: float
    light_count: int
    camera_count: int
    police_count: int
    store_count: int
    segment_scores: list[float]
    openness_avg: float | None = None
    reports_avg: float | None = None


def score_polylines(
    bq: bigquery.Client,
    polylines: list[str],
    weights: dict[str, float] | None = None,
) -> list[ScoredRoute]:
    """Score every encoded polyline, sharing one BigQuery job across all of them.

    The BigQuery helpers take a flat list of points and return a flat list of
    results, so all routes' sample midpoints are concatenated into one request
    and split back apart afterwards. That keeps the cost at two BigQuery jobs
    total (lights + cameras) regardless of how many candidate routes came in —
    job scheduling overhead dominates, so per-route jobs would be much slower.
    """
    if not polylines:
        return []

    route_lengths: list[list[float]] = []
    route_midpoints: list[list[LatLng]] = []
    all_midpoints: list[LatLng] = []
    route_circles: list[tuple[LatLng, float]] = []

    for encoded in polylines:
        points = geo.decode_polyline(encoded)
        sampled = geo.sample_by_distance(points, SEGMENT_SPACING_M)
        pairs = list(zip(sampled, sampled[1:]))
        route_lengths.append([geo.haversine_m(a, b) for a, b in pairs])
        midpoints = [geo.midpoint(a, b) for a, b in pairs]
        route_midpoints.append(midpoints)
        all_midpoints.extend(midpoints)
        route_circles.append(geo.covering_circle(sampled))

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        lights_future = pool.submit(bigquery_service.light_density_and_distance_batch, bq, all_midpoints)
        cameras_future = pool.submit(bigquery_service.camera_density_and_distance_batch, bq, all_midpoints)
        # Prospect / Escape / 社區通報。同樣一次送出全部取樣點，
        # 維持「BigQuery job 數與路線數無關」的成本結構。
        roads_future = pool.submit(bigquery_service.road_classes_batch, bq, all_midpoints)
        junctions_future = pool.submit(bigquery_service.junction_count_batch, bq, all_midpoints)
        reports_future = pool.submit(bigquery_service.nearest_report_distance_batch, bq, all_midpoints)
        store_futures = [pool.submit(places_service.list_24h_stores, c, r) for c, r in route_circles]
        police_futures = [pool.submit(places_service.count_police_stations, c, r) for c, r in route_circles]

        light_counts, light_nearest = lights_future.result()
        camera_counts, camera_nearest = cameras_future.result()
        # 這三張表可能還沒建立（例如尚未跑過 OSM 匯入），失敗時退回中性值，
        # 讓評分仍可產出而不是整個 /score 掛掉。
        road_classes = _safe_batch(roads_future, len(all_midpoints), [])
        junction_counts = _safe_batch(junctions_future, len(all_midpoints), 0)
        report_nearest = _safe_batch(reports_future, len(all_midpoints), 9999.0)
        # 有沒有真的拿到資料，決定 UI 要不要顯示這兩項
        has_roads = any(road_classes)
        has_reports = any(d < 9999.0 for d in report_nearest)
        route_stores = [f.result() for f in store_futures]
        route_police_totals = [f.result() for f in police_futures]

    results: list[ScoredRoute] = []
    idx = 0
    for lengths, midpoints, stores, police_total in zip(
        route_lengths, route_midpoints, route_stores, route_police_totals
    ):
        segments: list[Segment] = []
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
                    road_classes=tuple(road_classes[idx] or ()),
                    junction_count=junction_counts[idx],
                    report_nearest_m=report_nearest[idx],
                )
            )
            idx += 1

        results.append(
            ScoredRoute(
                # A polyline too short to yield even one segment can't be judged;
                # 0.0 would read as "extremely dangerous" rather than "unknown",
                # so callers should treat an empty-segment route as unscored.
                score=round(score_route(segments, weights), 1) if segments else 0.0,
                light_count=sum(s.light_count for s in segments),
                camera_count=sum(s.camera_count for s in segments),
                police_count=police_total,
                store_count=len(stores),
                segment_scores=[round(score_segment(s, weights), 1) for s in segments],
                # 路網／通報資料表缺席時 _safe_batch 已把值降級成中性，
                # 這裡回報 None 而不是那個中性值，UI 才能誠實標示「未納入」。
                openness_avg=(
                    round(sum(openness_score(s) for s in segments) / len(segments), 1)
                    if segments and has_roads else None
                ),
                reports_avg=(
                    round(sum(reports_score(s) for s in segments) / len(segments), 1)
                    if segments and has_reports else None
                ),
            )
        )

    return results
