"""本地評分 demo：用真實資料跑新舊演算法對照，輸出可互動的網頁地圖。

不需要 GCP 認證 —— 直接讀 frontend/data/ 底下的檔案在本機重算，
所以可以在資料還沒匯入 BigQuery 之前就先確認結果是否合理。

    cd backend
    python scripts/demo_scoring.py
    # 產生 demo_scoring.html，用瀏覽器打開
"""
import json
import math
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from services import safety_scorer as S  # noqa: E402

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "data")
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "demo_scoring.html")

SEGMENT_SPACING_M = 75.0

# 舊的三項權重，作為對照組
OLD_WEIGHTS = {
    "lighting": 0.40, "cctv": 0.25, "safe_haven": 0.35,
    "openness": 0.0, "reports": 0.0,
}

# Demo 路線：起訖點餵給 Google Directions 取真實步行路線。
#
# 不用手打座標：手繪的點常常落在街廓內部而不在路上，路網匹配就會大量
# 「無匹配」，看起來像演算法有問題，其實是測資有問題。
ROUTE_ENDPOINTS = {
    "忠孝東路主幹道（台北車站→善導寺）": ((25.04654, 121.51724), (25.04630, 121.52700)),
    "吳興街巷弄（北醫→信義區）": ((25.02640, 121.55980), (25.03200, 121.56470)),
    "信義路四段（大安→世貿）": ((25.03340, 121.54360), (25.03410, 121.56040)),
    "象山登山口周邊（暗處對照）": ((25.02420, 121.57080), (25.02220, 121.57430)),
}


def decode_polyline(encoded):
    points, index, lat, lng = [], 0, 0, 0
    while index < len(encoded):
        for is_lat in (True, False):
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else (result >> 1)
            if is_lat:
                lat += delta
            else:
                lng += delta
        points.append((lat / 1e5, lng / 1e5))
    return points


def fetch_route(origin, dest, key):
    """向 Google Directions 取一條真實步行路線。"""
    import urllib.request
    url = (
        "https://maps.googleapis.com/maps/api/directions/json"
        f"?origin={origin[0]},{origin[1]}&destination={dest[0]},{dest[1]}"
        f"&mode=walking&key={key}"
    )
    with urllib.request.urlopen(url, timeout=30) as r:
        data = json.load(r)
    if data.get("status") != "OK":
        return None
    return decode_polyline(data["routes"][0]["overview_polyline"]["points"])


def hav(a, b):
    r = 6_371_000
    dlat = math.radians(b[0] - a[0])
    dlng = math.radians(b[1] - a[1])
    h = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0]))
         * math.sin(dlng / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(h))


class Grid:
    """經緯度網格索引。逐點暴力比對 14 萬盞路燈會慢到不能用。"""

    def __init__(self, points, cell=0.002):
        self.cell = cell
        self.g = {}
        for p in points:
            k = (int(p[0] / cell), int(p[1] / cell))
            self.g.setdefault(k, []).append(p)

    def near(self, lat, lng, radius_m):
        r = int(radius_m / 111_000 / self.cell) + 1
        ci, cj = int(lat / self.cell), int(lng / self.cell)
        out = []
        for i in range(ci - r, ci + r + 1):
            for j in range(cj - r, cj + r + 1):
                out.extend(self.g.get((i, j), []))
        return out


def load(name):
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def densify(points, spacing=SEGMENT_SPACING_M):
    """把稀疏的手繪座標補點成固定間距，模擬真實 polyline 的取樣密度。"""
    if len(points) < 2:
        return points
    out = [points[0]]
    for a, b in zip(points, points[1:]):
        d = hav(a, b)
        n = max(1, int(d // spacing))
        for k in range(1, n + 1):
            t = k / n
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def read_maps_key():
    env = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env.local")
    if not os.path.exists(env):
        return ""
    for line in open(env, encoding="utf-8"):
        if line.startswith("NEXT_PUBLIC_GOOGLE_MAPS_KEY="):
            return line.split("=", 1)[1].strip()
    return ""


def main():
    lights = load("streetlights.json")
    cams = load("cctv.json")
    roads = load("roads.json")
    junctions = load("intersections.json")

    if not lights or not cams:
        print("缺少 streetlights.json / cctv.json")
        return 1

    print(f"路燈 {len(lights)} / CCTV {len(cams)}", end="")
    if roads:
        print(f" / 路網取樣點 {len(roads)} / 路口 {len(junctions or [])}")
    else:
        print()
        print("⚠️  尚無 roads.json，視野分數會全部用預設值。")
        print("    等 fetch_osm_roads.py 跑完再重跑本腳本才看得到真實差異。")

    g_light = Grid([(p["lat"], p["lng"]) for p in lights])
    g_cam = Grid([(p["lat"], p["lng"]) for p in cams])
    g_road = Grid([(p["lat"], p["lng"], p["cls"]) for p in roads]) if roads else None
    g_junc = Grid([(p["lat"], p["lng"]) for p in junctions]) if junctions else None

    key = read_maps_key()
    if not key:
        print("缺少 NEXT_PUBLIC_GOOGLE_MAPS_KEY，無法取得真實路線")
        return 1

    results = []
    for name, (origin, dest) in ROUTE_ENDPOINTS.items():
        raw = fetch_route(origin, dest, key)
        if not raw:
            print(f"  {name}: Directions 取不到路線，略過")
            continue
        sampled = densify(raw)
        pairs = list(zip(sampled, sampled[1:]))
        if not pairs:
            continue

        segs, meta = [], []
        for a, b in pairs:
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

            lc = [hav(mid, (p[0], p[1])) for p in g_light.near(mid[0], mid[1], 150)]
            cc = [hav(mid, (p[0], p[1])) for p in g_cam.near(mid[0], mid[1], 150)]

            # 半徑內出現過的所有分級。取最近的一條會抓到人行道，
            # 把主幹道判成小巷 —— 與 bigquery_service.road_classes_batch 同理。
            road_cls = ()
            if g_road:
                near = {p[2] for p in g_road.near(mid[0], mid[1], 50)
                        if hav(mid, (p[0], p[1])) <= 30}
                road_cls = tuple(sorted(near))

            jn = 0
            if g_junc:
                jn = sum(1 for p in g_junc.near(mid[0], mid[1], 80)
                         if hav(mid, (p[0], p[1])) <= 60)

            seg = S.Segment(
                length_m=hav(a, b),
                light_count=sum(1 for d in lc if d <= 100),
                light_nearest_m=min(lc) if lc else 9999.0,
                camera_count=sum(1 for d in cc if d <= 100),
                camera_nearest_m=min(cc) if cc else 9999.0,
                # demo 不打 Places API，庇護點固定中性值，
                # 這樣新舊差異才純粹來自權重與新增項目
                store_nearest_m=200.0,
                road_classes=road_cls,
                junction_count=jn,
                report_nearest_m=9999.0,
            )
            segs.append(seg)
            meta.append({
                "lat": mid[0], "lng": mid[1],
                "new": round(S.score_segment(seg), 1),
                "old": round(S.score_segment(seg, OLD_WEIGHTS), 1),
                "cls": "+".join(road_cls) if road_cls else "(無匹配)",
                "junctions": jn,
                "lights": seg.light_count,
                "openness": round(S.openness_score(seg), 1),
                "lighting": round(S.lighting_score(seg), 1),
            })

        results.append({
            "name": name,
            "path": [{"lat": p[0], "lng": p[1]} for p in sampled],
            "segments": meta,
            "new_score": round(S.score_route(segs), 1),
            "old_score": round(S.score_route(segs, OLD_WEIGHTS), 1),
        })

    print()
    print(f"{'路線':<32}{'舊':>7}{'新':>7}{'差異':>8}   道路分級")
    print("-" * 88)
    for r in results:
        cls = Counter(s["cls"] for s in r["segments"])
        top = "  ".join(f"{k}x{v}" for k, v in cls.most_common(3))
        diff = r["new_score"] - r["old_score"]
        print(f"{r['name']:<32}{r['old_score']:>7}{r['new_score']:>7}{diff:>+8.1f}   {top}")

    html = (HTML_TEMPLATE
            .replace("__DATA__", json.dumps(results, ensure_ascii=False))
            .replace("__KEY__", key))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print()
    print(f"已產生 {os.path.abspath(OUT)}")
    return 0


HTML_TEMPLATE = """<!doctype html>
<html lang="zh-TW"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NightMaMa 評分對照 Demo</title>
<style>
 body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,"Noto Sans TC",sans-serif;background:#0b0e1b;color:#fff}
 #wrap{display:flex;height:100vh}
 #side{width:400px;overflow-y:auto;padding:18px;box-sizing:border-box;border-right:1px solid #222}
 #map{flex:1}
 h1{font-size:17px;margin:0 0 4px}
 .sub{font-size:12px;color:#8b93a7;line-height:1.65;margin-bottom:16px}
 .card{background:#141824;border:1px solid #232838;border-radius:12px;padding:13px;margin-bottom:11px;cursor:pointer}
 .card.on{border-color:#6366f1;background:#181d2e}
 .nm{font-weight:800;font-size:13px;margin-bottom:9px}
 .row{display:flex;gap:9px}
 .box{flex:1;border-radius:8px;padding:7px 9px}
 .old{background:rgba(148,163,184,.13)}
 .new{background:rgba(99,102,241,.17)}
 .lb{font-size:10px;color:#8b93a7}
 .vl{font-size:19px;font-weight:900}
 .dl{font-size:11px;margin-top:8px;color:#8b93a7}
 .lg{margin-top:16px;font-size:11px;color:#8b93a7;line-height:1.85;border-top:1px solid #232838;padding-top:12px}
 .sw{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-1px;margin-right:5px}
</style></head><body>
<div id="wrap">
 <div id="side">
  <h1>安全評分對照</h1>
  <div class="sub">同一條路線，用舊的三項權重與新的五項權重各算一次。<br>
   點卡片切換路線，點地圖上的線段看該段細節。</div>
  <div id="cards"></div>
  <div class="lg">
   <b>路段顏色（新分數）</b><br>
   <span class="sw" style="background:#10b981"></span>65 以上 安全<br>
   <span class="sw" style="background:#f59e0b"></span>40-64 普通<br>
   <span class="sw" style="background:#ef4444"></span>40 以下 注意<br><br>
   <b>權重</b><br>
   舊：照明 40 / CCTV 25 / 庇護點 35<br>
   新：照明 30 / <b>視野 25</b> / 庇護點 25 / CCTV 10 / <b>通報 10</b><br><br>
   demo 未接 Places API，庇護點固定中性值，
   因此新舊差異純粹來自權重調整與新增的視野項。
  </div>
 </div>
 <div id="map"></div>
</div>
<script>
const DATA = __DATA__;
let map, layers = [], info, cur = 0;

function color(s){ return s >= 65 ? '#10b981' : s >= 40 ? '#f59e0b' : '#ef4444'; }

function cards(){
  document.getElementById('cards').innerHTML = DATA.map(function(r, i){
    var d = (r.new_score - r.old_score).toFixed(1);
    if (r.new_score - r.old_score >= 0) d = '+' + d;
    return '<div class="card ' + (i === cur ? 'on' : '') + '" onclick="show(' + i + ')">'
      + '<div class="nm">' + r.name + '</div>'
      + '<div class="row">'
      + '<div class="box old"><div class="lb">舊演算法</div><div class="vl" style="color:'
      + color(r.old_score) + '">' + r.old_score + '</div></div>'
      + '<div class="box new"><div class="lb">新演算法</div><div class="vl" style="color:'
      + color(r.new_score) + '">' + r.new_score + '</div></div>'
      + '</div>'
      + '<div class="dl">' + r.segments.length + ' 個路段 · 差異 ' + d + '</div>'
      + '</div>';
  }).join('');
}

function show(i){
  cur = i;
  cards();
  layers.forEach(function(l){ l.setMap(null); });
  layers = [];
  var r = DATA[i];
  var b = new google.maps.LatLngBounds();
  r.path.forEach(function(p){ b.extend(p); });

  r.segments.forEach(function(s, k){
    var a = r.path[k], c = r.path[k + 1];
    if (!c) return;
    var pl = new google.maps.Polyline({
      path: [a, c], map: map,
      strokeColor: color(s.new), strokeWeight: 9, strokeOpacity: 0.95
    });
    pl.addListener('click', function(){
      info.setContent(
        '<div style="color:#111;font-size:12px;line-height:1.8;min-width:200px">'
        + '<b>路段 ' + (k + 1) + '</b><br>'
        + '新分數 <b style="color:' + color(s.new) + '">' + s.new + '</b>'
        + ' ／ 舊分數 ' + s.old + '<br>'
        + '道路分級：<b>' + s.cls + '</b><br>'
        + '視野分數：' + s.openness + '　路口數：' + s.junctions + '<br>'
        + '照明分數：' + s.lighting + '　100m 內路燈：' + s.lights
        + '</div>');
      info.setPosition({ lat: s.lat, lng: s.lng });
      info.open(map);
    });
    layers.push(pl);
  });
  map.fitBounds(b, 60);
}

function initMap(){
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 25.036, lng: 121.55 }, zoom: 15,
    disableDefaultUI: true, gestureHandling: 'greedy'
  });
  info = new google.maps.InfoWindow();
  show(0);
}
window.initMap = initMap;
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=__KEY__&callback=initMap"></script>
</body></html>
"""

if __name__ == "__main__":
    sys.exit(main())
