"""BigQuery queries for streetlight/camera density and unsafe reports."""
import uuid
from datetime import datetime, timezone

from google.cloud import bigquery

from config import settings


def _count_within_radius(
    client: bigquery.Client,
    dataset: str,
    table: str,
    lat_col: str,
    lng_col: str,
    lat: float,
    lng: float,
    radius_m: float = 50,
) -> int:
    query = f"""
        SELECT COUNT(*) AS n
        FROM `{dataset}.{table}`
        WHERE ST_DWITHIN(ST_GEOGPOINT({lng_col}, {lat_col}), ST_GEOGPOINT(@lng, @lat), @radius)
    """
    job = client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("lat", "FLOAT64", lat),
                bigquery.ScalarQueryParameter("lng", "FLOAT64", lng),
                bigquery.ScalarQueryParameter("radius", "FLOAT64", radius_m),
            ]
        ),
    )
    return next(iter(job.result()))["n"]


def count_streetlights(client: bigquery.Client, lat: float, lng: float, radius_m: float = 50) -> int:
    return _count_within_radius(
        client, settings.bq_dataset_lights, settings.bq_table_lights, "latitude", "longitude", lat, lng, radius_m
    )


def count_cameras(client: bigquery.Client, lat: float, lng: float, radius_m: float = 50) -> int:
    return _count_within_radius(
        client, settings.bq_dataset_cameras, settings.bq_table_cameras, "lat", "lng", lat, lng, radius_m
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
