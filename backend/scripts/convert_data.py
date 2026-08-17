"""
NightMaMa 資料轉換腳本
將 TaipeiLight.csv (TWD97) 和 臺北市CCTV設備.csv (Big5) 轉為前端可用的 JSON 格式
執行: python scripts/convert_data.py
"""

import math
import csv
import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
# frontend/data/ (not public/) — 這些是給 import_bigquery.py 用的來源資料，
# 不是網站靜態資源，放 public/ 會被當成 8MB 的公開下載檔。
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'data')


def twd97_to_wgs84(x: float, y: float) -> tuple[float, float]:
    """TWD97 TM2 Zone (中央經線 121°) 轉換為 WGS84 (lat, lng)"""
    a = 6378137.0
    b = 6356752.314245
    lon0 = math.radians(121)
    k0 = 0.9999
    dx = 250000

    e2 = (a**2 - b**2) / a**2
    e_prime2 = (a**2 - b**2) / b**2

    x = x - dx
    # y stays as-is (no false northing in Taiwan TM2)

    M = y / k0
    mu = M / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))

    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (
        mu
        + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
        + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
        + (151 * e1**3 / 96) * math.sin(6 * mu)
        + (1097 * e1**4 / 512) * math.sin(8 * mu)
    )

    N1 = a / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    T1 = math.tan(phi1) ** 2
    C1 = e_prime2 * math.cos(phi1) ** 2
    R1 = a * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    D = x / (N1 * k0)

    lat = phi1 - (N1 * math.tan(phi1) / R1) * (
        D**2 / 2
        - (5 + 3 * T1 + 10 * C1 - 4 * C1**2 - 9 * e_prime2) * D**4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1**2 - 252 * e_prime2 - 3 * C1**2)
        * D**6
        / 720
    )
    lon = lon0 + (
        D
        - (1 + 2 * T1 + C1) * D**3 / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1**2 + 8 * e_prime2 + 24 * T1**2)
        * D**5
        / 120
    ) / math.cos(phi1)

    return math.degrees(lat), math.degrees(lon)


def parse_watt(val: str) -> float:
    """解析路燈瓦數字串"""
    try:
        return float(val.strip())
    except Exception:
        return 0.0


def convert_streetlights():
    """轉換路燈資料：TWD97 → WGS84，只保留位置 + 亮度資訊"""
    input_path = os.path.join(DATA_DIR, 'TaipeiLight.csv')
    output_path = os.path.join(OUTPUT_DIR, 'streetlights.json')

    print(f'[路燈] 讀取 {input_path} ...')
    lights = []

    with open(input_path, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            try:
                twd_x = float(row['TWD97X'].strip())
                twd_y = float(row['TWD97Y'].strip())
                lat, lng = twd97_to_wgs84(twd_x, twd_y)

                # 只保留台北市合理範圍內的資料
                if not (24.9 < lat < 25.3 and 121.3 < lng < 121.7):
                    continue

                # 計算總瓦數作為亮度指標
                total_watt = sum(
                    parse_watt(row.get(f'LightWatt{k}', '0'))
                    for k in range(1, 6)
                )
                qty = int(row.get('Quantity', '1').strip() or '1')

                lights.append({
                    'lat': round(lat, 6),
                    'lng': round(lng, 6),
                    'watt': total_watt,
                    'qty': qty,
                    'height': parse_watt(row.get('LightHeight', '0')),
                })

                if (i + 1) % 10000 == 0:
                    print(f'  ... 已處理 {i + 1} 筆')
            except Exception as e:
                continue  # 跳過格式錯誤的行

    print(f'[路燈] 有效資料: {len(lights)} 筆')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(lights, f, ensure_ascii=False, separators=(',', ':'))
    print(f'[路燈] 已輸出至 {output_path}')
    return lights


def convert_cctv():
    """轉換 CCTV 資料：Big5 解碼，WGSX/Y 直接是 WGS84"""
    input_path = os.path.join(DATA_DIR, '臺北市CCTV設備.csv')
    output_path = os.path.join(OUTPUT_DIR, 'cctv.json')

    print(f'[CCTV] 讀取 {input_path} ...')
    cameras = []

    with open(input_path, 'rb') as f:
        raw = f.read()

    # 嘗試 Big5 解碼
    text = raw.decode('big5', errors='replace')
    lines = text.strip().split('\r\n')
    header = lines[0].split(',')
    print(f'  欄位: {header}')

    for line in lines[1:]:
        parts = line.split(',')
        if len(parts) < 5:
            continue
        try:
            lng = float(parts[3].strip())  # WGSX = 經度
            lat = float(parts[4].strip())  # WGSY = 緯度

            # 台北市範圍過濾
            if not (24.9 < lat < 25.3 and 121.3 < lng < 121.7):
                continue

            cameras.append({
                'lat': round(lat, 6),
                'lng': round(lng, 6),
                'name': parts[2].strip() if len(parts) > 2 else '',
                'dist': parts[1].strip() if len(parts) > 1 else '',
            })
        except Exception:
            continue

    print(f'[CCTV] 有效資料: {len(cameras)} 筆')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(cameras, f, ensure_ascii=False, separators=(',', ':'))
    print(f'[CCTV] 已輸出至 {output_path}')
    return cameras


if __name__ == '__main__':
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    lights = convert_streetlights()
    cameras = convert_cctv()
    print(f'\n✅ 完成！路燈 {len(lights)} 筆，CCTV {len(cameras)} 筆')
    print(f'輸出目錄: {OUTPUT_DIR}')
