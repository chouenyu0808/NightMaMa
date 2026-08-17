"""Geocode the {id, address} pairs from extract_cctv_pdf.py into WGS84 lat/lng
via the Google Geocoding API. Dedupes identical address strings first so each
unique address is only billed once, then fans the result back out to every
camera id sharing that address.

Usage:
    cd backend
    python scripts/geocode_cctv.py
"""
import csv
import json
import os
import sys
import time

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import settings  # noqa: E402

IN_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "cctv_extracted.json")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "cctv_geocoded.json")
CSV_OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "cctv_geocoded.csv")
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"


def geocode(client: httpx.Client, address: str) -> tuple[float, float] | None:
    for attempt in range(3):
        resp = client.get(
            GEOCODE_URL,
            params={
                "address": f"台北市{address}",
                "region": "tw",
                "language": "zh-TW",
                "key": settings.geocoding_api_key or settings.google_maps_api_key,
            },
            timeout=10,
        )
        data = resp.json()
        status = data.get("status")
        if status == "OK":
            loc = data["results"][0]["geometry"]["location"]
            return loc["lat"], loc["lng"]
        if status == "OVER_QUERY_LIMIT":
            time.sleep(2 * (attempt + 1))
            continue
        return None  # ZERO_RESULTS / INVALID_REQUEST / etc — skip, not retryable
    return None


def main() -> None:
    with open(IN_PATH, encoding="utf-8") as f:
        rows = json.load(f)

    unique_addresses = sorted({r["address"] for r in rows})
    print(f"{len(rows)} 筆，{len(unique_addresses)} 個不重複地址")

    cache: dict[str, tuple[float, float] | None] = {}
    with httpx.Client() as client:
        for i, address in enumerate(unique_addresses):
            cache[address] = geocode(client, address)
            if (i + 1) % 200 == 0:
                ok = sum(1 for v in cache.values() if v)
                print(f"  進度 {i + 1}/{len(unique_addresses)}，成功 {ok}")

    results = []
    for r in rows:
        loc = cache.get(r["address"])
        if loc is None:
            continue
        results.append({"id": r["id"], "address": r["address"], "lat": loc[0], "lng": loc[1]})

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    with open(CSV_OUT_PATH, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "address", "lat", "lng"])
        writer.writeheader()
        writer.writerows(results)

    print(f"\n成功 {len(results)}/{len(rows)} 筆，失敗 {len(rows) - len(results)} 筆")
    print(f"輸出至 {OUT_PATH}")
    print(f"輸出至 {CSV_OUT_PATH}")


if __name__ == "__main__":
    main()
