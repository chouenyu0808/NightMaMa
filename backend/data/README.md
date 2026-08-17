# NightMaMa 資料說明

## 資料來源

| 檔案 | 來源 | 筆數 | 座標系 |
|------|------|------|--------|
| `TaipeiLight.csv` | data.taipei 路燈點位 | 145,919 盞 | TWD97 TM2 (需轉換) |
| `臺北市CCTV設備.csv` | 臺北市政府警察局 | 417 支 | WGS84 (可直接用) |
| `上傳-115上本局錄影監視統設置區位.pdf` | 同上 | 區域分布圖 | 參考用 |

## TaipeiLight.csv 欄位說明

```
SerialNumber  - 流水號
Dist          - 行政區
Quantity      - 燈具數量
LightKind1-5  - 燈具種類 (LED燈 / 水銀燈 / 螢光燈等)
LightWatt1-5  - 對應瓦數 (W)
LightHeight   - 燈桿高度 (m)
LightYear     - 安裝年份 (民國)
TWD97X        - X 座標 (公尺, TM2 中央經線 121°)
TWD97Y        - Y 座標 (公尺)
UpdDate       - 更新日期
```

## 臺北市CCTV設備.csv 欄位說明

```
流水號    - 序號
縣市      - 固定為 臺北市
錄影機名稱 - 設置地點描述
WGSX      - 經度 (WGS84)
WGSY      - 緯度 (WGS84)
```

## 座標轉換

TaipeiLight 使用 TWD97 TM2 Zone 座標，轉換公式見 `scripts/convert_data.py`

轉換測試:
- TWD97(300147.61, 2769150.06) → WGS84(25.029617, 121.496921) ✅

## 輸出格式 (public/data/)

### streetlights.json
```json
[
  {"lat": 25.029617, "lng": 121.496921, "watt": 75, "qty": 1, "height": 3.5},
  ...
]
```

### cctv.json
```json
[
  {"lat": 25.04855, "lng": 121.5169, "name": "001-市府快速道路", "dist": "臺北市"},
  ...
]
```
