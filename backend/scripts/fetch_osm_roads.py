"""一次性抓取：OpenStreetMap 台北市路網 -> frontend/data/roads.json + intersections.json

為什麼需要這份資料：
安全評分原本只看「路燈／CCTV／超商」的數量與距離，但環境犯罪學裡最紮實的
模型是 Fisher & Nasar (1992) 的 Prospect-Refuge-Escape —— 人在夜間感到害怕
主要來自「看不遠、對方有地方躲、自己無處可逃」。

道路分級是 prospect 最實用的代理指標：走在雙向四線道的忠孝東路，跟走在
兩公尺寬的無尾巷，路燈數量可能差不多，恐懼感卻天差地遠。
路口密度則對應 escape —— 每隔幾步就有岔路可以轉出去，比長直無出口的巷子安心。

實作備註：
- Overpass 主站經常回 504，因此內建鏡像輪替與重試。
- 台北市範圍一次查會逾時，切成網格分塊抓。
- 只有約 10% 的 way 有 lanes/width 標記，所以不依賴它們，改用 highway 分級。

執行：
    cd backend
    python scripts/fetch_osm_roads.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "data")

# 台北市行政區範圍（含一點緩衝，路線可能短暫越界）
BBOX = (24.95, 121.44, 25.22, 121.68)  # south, west, north, east
TILE_DEG = 0.03  # 每塊約 3.3 公里，實測不會逾時

MIRRORS = [
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]

# 沿 way 幾何取樣的間距（公尺）。太密會讓資料量爆炸，
# 太疏則短巷弄可能完全沒有取樣點。
SAMPLE_SPACING_M = 25.0

# 只抓行人實際會走到的道路，排除高速公路本體與純車道連接線
WANTED = (
    "motorway|trunk|primary|secondary|tertiary|unclassified|residential|"
    "living_street|pedestrian|footway|path|steps|service|track|road"
)


def build_query(s: float, w: float, n: float, e: float) -> str:
    return (
        f"[out:json][timeout:120];"
        f'(way["highway"~"^({WANTED})$"]({s},{w},{n},{e}););'
        f"out body geom;"
    )


def overpass(query: str, attempts: int = 3) -> dict:
    last = None
    for attempt in range(attempts):
        for mirror in MIRRORS:
            try:
                req = urllib.request.Request(
                    mirror,
                    data=urllib.parse.urlencode({"data": query}).encode(),
                    headers={"User-Agent": "NightMaMa-safety/1.0 (student project)"},
                )
                with urllib.request.urlopen(req, timeout=180) as r:
                    return json.load(r)
            except Exception as exc:  # noqa: BLE001 - 鏡像各種錯誤都只是換下一個
                last = exc
        # 全部鏡像都失敗才退避重試，避免對單一站台連續施壓
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Overpass 全數失敗: {last}")


def haversine_m(a: tuple, b: tuple) -> float:
    import math

    r = 6_371_000
    dlat = math.radians(b[0] - a[0])
    dlng = math.radians(b[1] - a[1])
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlng / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(h))


def sample_way(geometry: list, spacing_m: float) -> list:
    """沿折線等距取樣。短於間距的路段至少保留中點，否則小巷會整條消失。"""
    pts = [(g["lat"], g["lon"]) for g in geometry]
    if len(pts) < 2:
        return pts
    out = [pts[0]]
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        acc += haversine_m(a, b)
        if acc >= spacing_m:
            out.append(b)
            acc = 0.0
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return out


def main() -> None:
    south, west, north, east = BBOX
    tiles = []
    lat = south
    while lat < north:
        lng = west
        while lng < east:
            tiles.append((lat, lng, min(lat + TILE_DEG, north), min(lng + TILE_DEG, east)))
            lng += TILE_DEG
        lat += TILE_DEG

    print(f"台北市切成 {len(tiles)} 塊，開始抓取…", flush=True)

    road_points: list[dict] = []
    node_way_count: dict[int, int] = defaultdict(int)
    node_coord: dict[int, tuple] = {}
    seen_ways: set[int] = set()
    cls_counter: Counter = Counter()

    for i, (s, w, n, e) in enumerate(tiles, 1):
        try:
            data = overpass(build_query(s, w, n, e))
        except Exception as exc:  # noqa: BLE001
            print(f"  [{i}/{len(tiles)}] 失敗，跳過：{exc}", flush=True)
            continue

        elements = data.get("elements", [])
        added = 0
        for el in elements:
            wid = el.get("id")
            # 網格邊界會讓同一條 way 出現在多塊，去重避免重複取樣
            if wid in seen_ways:
                continue
            seen_ways.add(wid)

            cls = el.get("tags", {}).get("highway")
            geom = el.get("geometry") or []
            if not cls or len(geom) < 2:
                continue

            cls_counter[cls] += 1
            for lat_, lng_ in sample_way(geom, SAMPLE_SPACING_M):
                road_points.append({"lat": round(lat_, 6), "lng": round(lng_, 6), "cls": cls})
                added += 1

            # 路口偵測：被兩條以上 way 共用的節點就是交叉口
            nodes = el.get("nodes") or []
            for idx, nid in enumerate(nodes):
                node_way_count[nid] += 1
                if nid not in node_coord and idx < len(geom):
                    node_coord[nid] = (geom[idx]["lat"], geom[idx]["lon"])

        print(f"  [{i}/{len(tiles)}] {len(elements)} ways → +{added} 取樣點（累計 {len(road_points)}）", flush=True)

    intersections = [
        {"lat": round(node_coord[nid][0], 6), "lng": round(node_coord[nid][1], 6)}
        for nid, count in node_way_count.items()
        if count >= 2 and nid in node_coord
    ]

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, "roads.json"), "w", encoding="utf-8") as f:
        json.dump(road_points, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(DATA_DIR, "intersections.json"), "w", encoding="utf-8") as f:
        json.dump(intersections, f, ensure_ascii=False, separators=(",", ":"))

    print()
    print(f"完成。道路取樣點 {len(road_points)}，路口 {len(intersections)}")
    print("道路分級分布（way 數）：")
    for k, v in cls_counter.most_common():
        print(f"  {k:16} {v}")


if __name__ == "__main__":
    sys.exit(main())
