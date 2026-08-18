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


def road_classes_batch(
    client: bigquery.Client, points: list[LatLng], radius_m: float = 30
) -> list[list[str]]:
    """每個查詢點半徑內出現過的所有 OSM highway 分級。

    刻意回傳全部而不是最近的一條：行人走在主幹道旁時，人在人行道上，
    而人行道（footway）的中心線比車道中心線更靠近路線取樣點。取最近的
    一條會把台北最寬的幾條大馬路判成小巷。由 safety_scorer 從清單中挑
    最開闊的一項，判斷邏輯集中在一處，不會像先前那樣在 SQL 與 Python
    兩邊各寫一份而慢慢漂移。

    半徑取 30m：夠涵蓋人行道到車道中心的距離，又不會從真正的窄巷抓到
    隔一個街廓的大馬路（台北街廓多在 50-100m）。
    """
    if not points:
        return []
    query = f"""
        SELECT qp.idx AS idx, ARRAY_AGG(DISTINCT t.cls IGNORE NULLS) AS classes
        FROM (
            SELECT lt AS lat, lg AS lng, i AS idx
            FROM UNNEST(@lats) AS lt WITH OFFSET i
            JOIN UNNEST(@lngs) AS lg WITH OFFSET j ON i = j
        ) AS qp
        LEFT JOIN `{settings.bq_dataset_roads}.{settings.bq_table_roads}` AS t
          ON ST_DWITHIN(ST_GEOGPOINT(t.lng, t.lat), ST_GEOGPOINT(qp.lng, qp.lat), @radius)
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
    rows = {row["idx"]: list(row["classes"] or []) for row in job.result()}
    return [rows.get(i, []) for i in range(len(points))]


def junction_count_batch(
    client: bigquery.Client, points: list[LatLng], radius_m: float = 60
) -> list[int]:
    """每個查詢點半徑內的路口數量，作為 escape（可轉出去的岔路）指標。"""
    if not points:
        return []
    query = f"""
        SELECT qp.idx AS idx, COUNT(t.lat) AS n
        FROM (
            SELECT lt AS lat, lg AS lng, i AS idx
            FROM UNNEST(@lats) AS lt WITH OFFSET i
            JOIN UNNEST(@lngs) AS lg WITH OFFSET j ON i = j
        ) AS qp
        LEFT JOIN `{settings.bq_dataset_roads}.{settings.bq_table_junctions}` AS t
          ON ST_DWITHIN(ST_GEOGPOINT(t.lng, t.lat), ST_GEOGPOINT(qp.lng, qp.lat), @radius)
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
    rows = {row["idx"]: row["n"] for row in job.result()}
    return [rows.get(i, 0) for i in range(len(points))]


def nearest_report_distance_batch(
    client: bigquery.Client, points: list[LatLng], max_age_days: int = 180
) -> list[float]:
    """每個查詢點到最近一則社區不安通報的距離。

    只看近半年的通報：治安狀況會變，兩年前的一則回報不該永久壓低某條巷子的
    分數。找不到就回 9999 的哨兵值，safety_scorer 會視為「附近沒有通報」。
    """
    if not points:
        return []
    table = f"{settings.bq_dataset}.unsafe_reports"
    query = f"""
        SELECT qp.idx AS idx,
               MIN(ST_DISTANCE(ST_GEOGPOINT(t.lng, t.lat), ST_GEOGPOINT(qp.lng, qp.lat))) AS nearest_m
        FROM (
            SELECT lt AS lat, lg AS lng, i AS idx
            FROM UNNEST(@lats) AS lt WITH OFFSET i
            JOIN UNNEST(@lngs) AS lg WITH OFFSET j ON i = j
        ) AS qp
        LEFT JOIN `{table}` AS t
          ON t.reported_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @max_age DAY)
        GROUP BY idx
    """
    job = client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("lats", "FLOAT64", [p.lat for p in points]),
                bigquery.ArrayQueryParameter("lngs", "FLOAT64", [p.lng for p in points]),
                bigquery.ScalarQueryParameter("max_age", "INT64", max_age_days),
            ]
        ),
    )
    rows = {row["idx"]: row["nearest_m"] for row in job.result()}
    return [rows.get(i) or 9999.0 for i in range(len(points))]
