"""One-off import: frontend/public/data/{streetlights,cctv}.json -> BigQuery.

Reuses the already-cleaned WGS84 output of convert_data.py instead of
re-parsing the raw TWD97/Big5 CSVs. Safe to re-run (WRITE_TRUNCATE).

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

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "data")

STREETLIGHTS_SCHEMA = [
    bigquery.SchemaField("id", "STRING"),
    bigquery.SchemaField("lat", "FLOAT64"),
    bigquery.SchemaField("lng", "FLOAT64"),
    bigquery.SchemaField("lux_estimate", "FLOAT64"),
    bigquery.SchemaField("source_updated_at", "TIMESTAMP"),
]

CAMERAS_SCHEMA = [
    bigquery.SchemaField("id", "STRING"),
    bigquery.SchemaField("lat", "FLOAT64"),
    bigquery.SchemaField("lng", "FLOAT64"),
    bigquery.SchemaField("type", "STRING"),
    bigquery.SchemaField("source_updated_at", "TIMESTAMP"),
]

UNSAFE_REPORTS_SCHEMA = [
    bigquery.SchemaField("id", "STRING"),
    bigquery.SchemaField("lat", "FLOAT64"),
    bigquery.SchemaField("lng", "FLOAT64"),
    bigquery.SchemaField("reason", "STRING"),
    bigquery.SchemaField("reported_at", "TIMESTAMP"),
    bigquery.SchemaField("session_hash", "STRING"),
]


def _load(client: bigquery.Client, table_name: str, schema: list, rows: list) -> None:
    table_id = f"{settings.gcp_project_id}.{settings.bq_dataset}.{table_name}"
    client.create_table(bigquery.Table(table_id, schema=schema), exists_ok=True)
    if not rows:
        return
    job = client.load_table_from_json(
        rows,
        table_id,
        job_config=bigquery.LoadJobConfig(schema=schema, write_disposition="WRITE_TRUNCATE"),
    )
    job.result()
    print(f"[{table_name}] 匯入 {len(rows)} 筆")


def main() -> None:
    client = bigquery.Client(project=settings.gcp_project_id or None)
    now = datetime.now(timezone.utc).isoformat()

    with open(os.path.join(DATA_DIR, "streetlights.json"), encoding="utf-8") as f:
        lights = json.load(f)
    light_rows = [
        {
            "id": str(uuid.uuid4()),
            "lat": light["lat"],
            "lng": light["lng"],
            "lux_estimate": light["watt"],
            "source_updated_at": now,
        }
        for light in lights
    ]
    _load(client, "streetlights", STREETLIGHTS_SCHEMA, light_rows)

    with open(os.path.join(DATA_DIR, "cctv.json"), encoding="utf-8") as f:
        cameras = json.load(f)
    camera_rows = [
        {
            "id": str(uuid.uuid4()),
            "lat": cam["lat"],
            "lng": cam["lng"],
            "type": cam.get("name", ""),
            "source_updated_at": now,
        }
        for cam in cameras
    ]
    _load(client, "cameras", CAMERAS_SCHEMA, camera_rows)

    # unsafe_reports 只建表，資料由使用者回報累積
    _load(client, "unsafe_reports", UNSAFE_REPORTS_SCHEMA, [])

    print("完成。")


if __name__ == "__main__":
    main()
