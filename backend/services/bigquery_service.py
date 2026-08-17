"""BigQuery queries for streetlight/camera density and unsafe reports."""
import uuid
from datetime import datetime, timezone

from google.cloud import bigquery

from config import settings
from models.schemas import LatLng


def _density_and_nearest_batch(
    client: bigquery.Client,
    dataset: str,
    table: str,
    lat_col: str,
    lng_col: str,
    points: list[LatLng],
    radius_m: float = 100,  # ponytail: 50m left too many sampled points with 0 nearby hits, tanking worst-segment scores; raise further if still too sparse
) -> tuple[list[int], list[float]]:
    """Density (count within radius) AND distance to the single nearest row, for every
    query point in one BigQuery job instead of one job per point.

    A single job costs ~0.5-2s just in scheduling overhead regardless of how
    simple the query is, so firing one per sampled route point (even in
    parallel) was the dominant cost of /routes. UNNEST + CROSS JOIN does one
    full scan of the (small) reference table per call instead — trivial for
    BigQuery — and returns both numbers for every point from that one job
    (MIN(ST_DISTANCE) is free once the cross join for COUNTIF already happened).
    """
    if not points:
        return [], []
    # Two parallel FLOAT64 arrays instead of one STRUCT array — the BigQuery
    # client's STRUCT array parameter type string isn't accepted as a plain
    # value by the API (400 BadRequest), so zip lat/lng back together in SQL.
    query = f"""
        SELECT
            qp.idx AS idx,
            COUNTIF(ST_DWITHIN(ST_GEOGPOINT(t.{lng_col}, t.{lat_col}), ST_GEOGPOINT(qp.lng, qp.lat), @radius)) AS n,
            MIN(ST_DISTANCE(ST_GEOGPOINT(t.{lng_col}, t.{lat_col}), ST_GEOGPOINT(qp.lng, qp.lat))) AS nearest_m
        FROM (
            SELECT lt AS lat, lg AS lng, i AS idx
            FROM UNNEST(@lats) AS lt WITH OFFSET i
            JOIN UNNEST(@lngs) AS lg WITH OFFSET j ON i = j
        ) AS qp
        CROSS JOIN `{dataset}.{table}` AS t
        GROUP BY idx
    """
    job = client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("lats", "FLOAT64", [p.lat for p in points]),
                bigquery.ArrayQueryParameter("lngs", "FLOAT64", [p.lng for p in points]),
                bigquery.ScalarQueryParameter("radius", "FLOAT64", radius_m),
            ]
        ),
    )
    rows = {row["idx"]: (row["n"], row["nearest_m"]) for row in job.result()}
    counts = [rows.get(i, (0, None))[0] for i in range(len(points))]
    # ponytail: 9999m sentinel for an (unrealistic) empty reference table, so downstream proximity scoring just sees "far away" instead of crashing on None
    nearest = [rows.get(i, (0, None))[1] or 9999.0 for i in range(len(points))]
    return counts, nearest


def light_density_and_distance_batch(client: bigquery.Client, points: list[LatLng], radius_m: float = 100) -> tuple[list[int], list[float]]:
    return _density_and_nearest_batch(
        client, settings.bq_dataset_lights, settings.bq_table_lights, "latitude", "longitude", points, radius_m
    )


def camera_density_and_distance_batch(client: bigquery.Client, points: list[LatLng], radius_m: float = 100) -> tuple[list[int], list[float]]:
    return _density_and_nearest_batch(
        client, settings.bq_dataset_cameras, settings.bq_table_cameras, "lat", "lng", points, radius_m
    )


def insert_unsafe_report(client: bigquery.Client, lat: float, lng: float, reason: str, session_hash: str) -> None:
    table = f"{settings.bq_dataset}.unsafe_reports"
    row = {
        "id": str(uuid.uuid4()),
        "lat": lat,
        "lng": lng,
        "reason": reason,
        "session_hash": session_hash,
        "reported_at": datetime.now(timezone.utc).isoformat(),
    }
    errors = client.insert_rows_json(table, [row])
    if errors:
        raise RuntimeError(f"BigQuery insert failed: {errors}")


def list_unsafe_reports(client: bigquery.Client, limit: int = 200) -> list[dict]:
    """Most recent anonymized reports for map display — no session_hash in the result."""
    table = f"{settings.bq_dataset}.unsafe_reports"
    query = f"""
        SELECT id, lat, lng, reason, reported_at
        FROM `{table}`
        ORDER BY reported_at DESC
        LIMIT @limit
    """
    job = client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("limit", "INT64", limit)]
        ),
    )
    return [
        {
            "id": row["id"],
            "lat": row["lat"],
            "lng": row["lng"],
            "reason": row["reason"],
            # TIMESTAMP column comes back as datetime — isoformat() so the frontend's `new Date()` parses it reliably across browsers
            "reported_at": row["reported_at"].isoformat(),
        }
        for row in job.result()
    ]
