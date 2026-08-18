"""One-off import: frontend/data/{streetlights,cctv}.json -> BigQuery.

Reuses the already-cleaned WGS84 output of convert_data.py instead of
re-parsing the raw TWD97/Big5 CSVs. Safe to re-run (WRITE_TRUNCATE).

Every destination (dataset, table, and lat/lng column names) is derived from
config.py — the same values services/bigquery_service.py queries at runtime.
Do not hardcode names here: they previously drifted apart (this script wrote
`<project>.nightmama.streetlights` with lat/lng columns while the scorer
queried `LIGHT_TAIPEI.StreetLight` expecting latitude/longitude), so the import
appeared to succeed but every route scored 0.

Run once ADC is set up (see backend-architecture.md). Must run with CWD=backend/
so config.py picks up backend/.env, same as running the API server:
    cd backend
    python scripts/import_bigquery.py
"""
import json
import os
import sys
import uuid
from datetime import datetime, timezone

from google.cloud import bigquery

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import settings  # noqa: E402

# frontend/data/ (not public/) — these files are import sources, not web assets.
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "data")

# Location of the reference tables the safety scorer reads. bigquery_service
# queries lights by latitude/longitude and cameras by lat/lng, so the schemas
# below must use exactly those column names.
LIGHT_LAT_COL, LIGHT_LNG_COL = "latitude", "longitude"
CAMERA_LAT_COL, CAMERA_LNG_COL = "lat", "lng"

STREETLIGHTS_SCHEMA = [
    bigquery.SchemaField("id", "STRING"),
    bigquery.SchemaField(LIGHT_LAT_COL, "FLOAT64"),
    bigquery.SchemaField(LIGHT_LNG_COL, "FLOAT64"),
    bigquery.SchemaField("lux_estimate", "FLOAT64"),
    bigquery.SchemaField("source_updated_at", "TIMESTAMP"),
]

CAMERAS_SCHEMA = [
    bigquery.SchemaField("id", "STRING"),
    bigquery.SchemaField(CAMERA_LAT_COL, "FLOAT64"),
    bigquery.SchemaField(CAMERA_LNG_COL, "FLOAT64"),
    bigquery.SchemaField("type", "STRING"),
    bigquery.SchemaField("source_updated_at", "TIMESTAMP"),
]

ROADS_SCHEMA = [
    bigquery.SchemaField("lat", "FLOAT64"),
    bigquery.SchemaField("lng", "FLOAT64"),
    # OSM highway tag，safety_scorer 的 ROAD_OPENNESS 會查這個值
    bigquery.SchemaField("cls", "STRING"),
]

JUNCTIONS_SCHEMA = [
    bigquery.SchemaField("lat", "FLOAT64"),
    bigquery.SchemaField("lng", "FLOAT64"),
]

UNSAFE_REPORTS_SCHEMA = [
    bigquery.SchemaField("id", "STRING"),
    bigquery.SchemaField("lat", "FLOAT64"),
    bigquery.SchemaField("lng", "FLOAT64"),
    bigquery.SchemaField("reason", "STRING"),
    bigquery.SchemaField("reported_at", "TIMESTAMP"),
    bigquery.SchemaField("session_hash", "STRING"),
]

# Taipei open data; keep the reference tables next to the compute region.
BQ_LOCATION = os.environ.get("BQ_LOCATION", "asia-east1")


def _ensure_dataset(client: bigquery.Client, dataset: str) -> None:
    """create_table 404s if the dataset itself is missing, so create it first."""
    dataset_id = f"{client.project}.{dataset}"
    ds = bigquery.Dataset(dataset_id)
    ds.location = BQ_LOCATION
    client.create_dataset(ds, exists_ok=True)


def _load(client: bigquery.Client, dataset: str, table_name: str, schema: list, rows: list) -> None:
    _ensure_dataset(client, dataset)
    table_id = f"{client.project}.{dataset}.{table_name}"
    client.create_table(bigquery.Table(table_id, schema=schema), exists_ok=True)
    if not rows:
        print(f"[{dataset}.{table_name}] 建表完成（無資料列）")
        return
    job = client.load_table_from_json(
        rows,
        table_id,
        job_config=bigquery.LoadJobConfig(schema=schema, write_disposition="WRITE_TRUNCATE"),
    )
    job.result()
    print(f"[{dataset}.{table_name}] 匯入 {len(rows)} 筆")


def main() -> None:
    client = bigquery.Client(project=settings.gcp_project_id or None)
    now = datetime.now(timezone.utc).isoformat()

    print(f"專案: {client.project} / 位置: {BQ_LOCATION}")

    with open(os.path.join(DATA_DIR, "streetlights.json"), encoding="utf-8") as f:
        lights = json.load(f)
    light_rows = [
        {
            "id": str(uuid.uuid4()),
            LIGHT_LAT_COL: light["lat"],
            LIGHT_LNG_COL: light["lng"],
            "lux_estimate": light["watt"],
            "source_updated_at": now,
        }
        for light in lights
    ]
    _load(client, settings.bq_dataset_lights, settings.bq_table_lights, STREETLIGHTS_SCHEMA, light_rows)

    with open(os.path.join(DATA_DIR, "cctv.json"), encoding="utf-8") as f:
        cameras = json.load(f)
    camera_rows = [
        {
            "id": str(uuid.uuid4()),
            CAMERA_LAT_COL: cam["lat"],
            CAMERA_LNG_COL: cam["lng"],
            "type": cam.get("name", ""),
            "source_updated_at": now,
        }
        for cam in cameras
    ]
    _load(client, settings.bq_dataset_cameras, settings.bq_table_cameras, CAMERAS_SCHEMA, camera_rows)

    # OSM 路網：Prospect / Escape 評分用。先跑 fetch_osm_roads.py 產生檔案。
    roads_path = os.path.join(DATA_DIR, "roads.json")
    junctions_path = os.path.join(DATA_DIR, "intersections.json")
    if os.path.exists(roads_path) and os.path.exists(junctions_path):
        with open(roads_path, encoding="utf-8") as f:
            roads = json.load(f)
        _load(client, settings.bq_dataset_roads, settings.bq_table_roads, ROADS_SCHEMA, roads)

        with open(junctions_path, encoding="utf-8") as f:
            junctions = json.load(f)
        _load(client, settings.bq_dataset_roads, settings.bq_table_junctions, JUNCTIONS_SCHEMA, junctions)
    else:
        print()
        print("⚠️  找不到 roads.json / intersections.json，略過路網匯入。")
        print("    先執行 python scripts/fetch_osm_roads.py 產生這兩個檔案，")
        print("    否則 Prospect / Escape 這一項會退回中性值。")

    # unsafe_reports 只建表，資料由使用者回報累積
    _load(client, settings.bq_dataset, "unsafe_reports", UNSAFE_REPORTS_SCHEMA, [])

    print()
    print("完成。評分程式會從以下位置讀取：")
    print(f"  路燈: {settings.bq_dataset_lights}.{settings.bq_table_lights} ({LIGHT_LAT_COL}/{LIGHT_LNG_COL})")
    print(f"  CCTV: {settings.bq_dataset_cameras}.{settings.bq_table_cameras} ({CAMERA_LAT_COL}/{CAMERA_LNG_COL})")
    print(f"  路網: {settings.bq_dataset_roads}.{settings.bq_table_roads} (lat/lng/cls)")
    print(f"  路口: {settings.bq_dataset_roads}.{settings.bq_table_junctions} (lat/lng)")


if __name__ == "__main__":
    main()
