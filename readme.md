# 🌙 NightMaMa (LumiMaMa) — 夜間安全導航 · AI 守護每一步

> **專為夜間步行族群（女性、學生、加班夜歸族）設計的智慧夜間安全導航與 Google Gemini AI 雙向語音陪伴平台。**

![Next.js](https://img.shields.io/badge/Next.js-16_App_Router-000000?style=for-the-badge&logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)
![Google Maps](https://img.shields.io/badge/Google_Maps-Routes_API_v2-4285F4?style=for-the-badge&logo=googlemaps)
![Gemini AI](https://img.shields.io/badge/Google_Gemini-2.5_Flash-8E75FF?style=for-the-badge&logo=googlegemini)
![GCP Cloud Run](https://img.shields.io/badge/GCP-Cloud_Run-4285F4?style=for-the-badge&logo=googlecloud)
![LINE](https://img.shields.io/badge/LINE-Messaging_API-00B900?style=for-the-badge&logo=line)

---

## 📖 專案簡介 (About NightMaMa)

**NightMaMa** 旨在解決獨自夜間步行時對「暗巷死角、缺乏治安監視器」與「孤單焦慮感」的焦慮痛點。

我們結合 **台北市 145,919 盞路燈大數據** 與 **5,036 支警察局監視器地點**，研發出專利的**夜間加權安全演算法**，不再只推薦「最快」路線，而是為使用者推薦「照明最充足、巡邏與監視覆蓋率最高」的安全明亮大路。

同時導入 **Google Gemini 2.5 Flash 大語言模型** 與 **LINE 聊天室風格語音對話介面**，在夜歸全程提供無微不至的即時陪伴與隨時應急救援（LINE 定位通報 / 模擬假電話）。

---

## ✨ 核心功能亮點 (Core Features)

### 1. 🛡️ 夜間加權安全演算法 (Night Safety Scoring Engine)
- **等距分段採樣**：沿路線每 **75 公尺** 切一段（`backend/utils/geo.py: sample_by_distance`），確保長路線不會被切成少數幾個粗略區塊。
- **三項加權**：每段計算 `照明 40% + CCTV 25% + 安全庇護點 35%`，各項再由「半徑 100m 內密度」與「最近一個的距離衰減」混合而成。
- **取最差路段，而非平均**：整條路線分數 = `min(所有路段分數)`，一段暗巷不會被其他明亮路段平均掉。實作見 `backend/services/safety_scorer.py`。
- **資料來源為真實開放資料**：路燈與 CCTV 走 BigQuery 空間查詢（`ST_DWITHIN` / `ST_DISTANCE`），24h 超商與派出所走 Google Places。
- **多路線對比**：提供 `🟢 最安全`、`⚖️ 平衡`、`⚡ 最快` 與 `🚌 大眾運輸` 切換。

> **取不到評分時的行為**：若評分後端未部署或呼叫失敗，介面會明確顯示「評分無法取得」並在路線卡上出示警告，**不會**退回任何預估或預設分數。

### 2. 🧭 Google 3D Turn-by-Turn 導航與 Heading-UP 視角旋轉
- **原生導航介面**：頂部 Google 墨綠導航 Banner（`#024738`），提示目前街道與下一步轉彎預告。
- **Heading-UP 方位旋轉**：地圖視角隨著使用者實體行走面朝方向即時旋轉，永遠保持「人朝向的方向朝上」。
- **動態軌跡裁切與自動偏離重算**：藍色點陣軌跡隨步伐即時縮短；偏離路線 > 60m 時自動重新算路。
- **5 ~ 15 步詳細轉彎指引**：自動幾何角度分析演算法，生成完整的直行、轉彎與抵達指引。

### 3. 💚 LINE 聊天室風格 Gemini 2.5 Flash 實時 AI 語音陪聊 (`/companion`)
- **1:1 復刻 LINE 介面**：天空藍壁紙、LINE 亮綠對話氣泡 (`#86E260`)、已讀狀態與時間戳記。
- **極速動態 AI 回應**：接入最新 **Gemini 2.5 Flash** API，0.5 秒內生成溫暖且符合當前路線上下文的即時回答。
- **台灣溫柔女聲朗讀**：整合 Web Speech API，調配 Pitch 1.25 / Rate 0.95 溫馨語調。

### 4. 🆘 一鍵 SOS 緊急應急救援 (`/sos`)
- **LINE 即時定位簡訊**：一鍵將包含正確 GPS 座標與 Google 地圖連結的求救簡訊發送至緊急聯絡人 LINE。
- **真實 iPhone 來電模擬 (假電話)**：顯示極具逼真度的來電畫面並播放親友詢問音訊，有效嚇阻潛在跟蹤者。
- **110 / 113 快速報警**：一鍵直撥警政緊急專線。

---

## 🏗️ 系統架構與流程圖 (Architecture & Flowcharts)

系統包含完整的架構設計與 Mermaid 視覺化流程圖，請參閱 [docs/FLOWCHARTS.md](docs/FLOWCHARTS.md)：
1. 🏗️ **系統總體架構圖** (System Architecture Diagram)
2. ⚖️ **夜間加權安全演算法流程圖** (Safety Scoring Flowchart)
3. 🧭 **3D Turn-by-Turn 導航與 Heading-UP 視角旋轉流程圖** (Google Navigation Flowchart)
4. 🎙️ **Gemini 2.5 Flash AI 雙向語音陪伴流程圖** (Voice Companion Flowchart)
5. 🆘 **一鍵 SOS 通報與假電話流程圖** (Emergency Flowchart)

---

## 🛠️ 技術堆疊 (Tech Stack)

| 領域 | 技術 / 服務 |
| :--- | :--- |
| **前端框架** | Next.js 16 (App Router), React 19, TypeScript, Vanilla CSS (CSS Variables) |
| **導航與地圖** | Google Maps JavaScript SDK, Google Routes API v2 REST |
| **AI 大語言模型** | Google Gemini 2.5 Flash (`generativelanguage.googleapis.com`)，語音通話走 Live API + ephemeral token |
| **語音互動** | Web Speech API (`SpeechSynthesis` & `SpeechRecognition`) |
| **緊急通報** | LINE Messaging API Push（LINE Notify 已於 2025-03-31 終止服務） |
| **安全評分後端** | FastAPI + BigQuery（路燈／CCTV 空間查詢）+ Google Places |
| **雲端部署** | GCP Cloud Run ×2（前端 Web + 評分 API）, Multi-stage Docker |

---

## 📊 開發數據來源 (Open Data)

- **台北市路燈資訊**：全台北市 145,919 盞路燈點位座標 (`frontend/data/streetlights.json` → 匯入 BigQuery)
- **台北市警察局與市府監視器**：5,036 支 CCTV 監視器地理座標（解析警察局公開 PDF 檔案 `backend/data/上傳-115上本局錄影監視統設置區位.pdf` 匯入 `frontend/data/cctv.json` → BigQuery）

---

## 🚀 本地開發快速開始 (Quick Start)

### 1. 複製專案
```bash
git clone https://github.com/chouenyu0808/NightMaMa.git
cd NightMaMa/frontend
```

### 2. 安裝依賴套件
```bash
npm install
```

### 3. 設定環境變數 (`.env.local`)
複製 `frontend/.env.local.example` 成 `.env.local` 並填入實際值。

> ⚠️ **命名規則很重要**：`NEXT_PUBLIC_` 前綴的變數會被編進瀏覽器 bundle，任何訪客都看得到。
> 只有 Google Maps 瀏覽器金鑰該用這個前綴（Maps JS SDK 必須在前端載入，請改用 GCP Console 的
> HTTP referrer 限制防護）。Gemini 金鑰與 LINE token **一律不可加前綴**。

```env
# 瀏覽器端可見
NEXT_PUBLIC_GOOGLE_MAPS_KEY=YOUR_GOOGLE_MAPS_BROWSER_KEY

# 僅伺服器端
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
LINE_CHANNEL_ACCESS_TOKEN=YOUR_LINE_CHANNEL_ACCESS_TOKEN
BACKEND_URL=http://localhost:8000
```

### 4. 啟動開發伺服器
```bash
npm run dev
```
打開瀏覽器存取 **[http://localhost:3000](http://localhost:3000)** 即可體驗。

（安全評分需要另外啟動後端，見下一節；未啟動時介面會顯示「評分無法取得」。）

---

## ☁️ GCP Cloud Run 雲端部署 (Deployment)

系統由**兩個 Cloud Run 服務**組成，且有相依順序 —— 前端需要後端網址才能取得安全評分。

### 第一次部署前的一次性準備

```bash
# 把台北市路燈與 CCTV 開放資料匯入 BigQuery
cd backend
python scripts/import_bigquery.py
```

同時確認後端 Cloud Run 的服務帳號具備 **BigQuery Job User** 與 **BigQuery Data Viewer** 權限。

### Step 1 — 部署評分後端

```bash
cd backend
bash deploy.sh
```

腳本結束時會印出後端網址，把它填進 `frontend/.env.local` 的 `BACKEND_URL`。

### Step 2 — 部署前端

```bash
cd frontend
bash deploy.sh
```

- **線上展示網址**：[https://nightmama-321739351322.asia-east1.run.app](https://nightmama-321739351322.asia-east1.run.app)

### 🔐 金鑰處理原則

| 金鑰 | 注入方式 | 原因 |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Docker `--build-arg` | Maps JS SDK 在瀏覽器執行，無法隱藏；靠 referrer 限制防護 |
| `GEMINI_API_KEY` | Cloud Run runtime 環境變數 | 僅伺服器端使用；語音通話透過 `/api/live-token` 換發短期 token |
| `LINE_CHANNEL_ACCESS_TOKEN` | Cloud Run runtime 環境變數 | 僅伺服器端使用，永不接受用戶端傳入 |
| `BACKEND_URL` | Cloud Run runtime 環境變數 | 前端透過 `/api/score` 代理，瀏覽器不直連後端 |

`.dockerignore` 已排除所有 `.env*` 檔案，避免金鑰被複製進 image layer。正式環境建議把
runtime 金鑰改用 Secret Manager（`gcloud run deploy --set-secrets`）。

---

## 📄 專案團隊與授權 (License)

- **專案名稱**：NightMaMa (夜間安全導航 · AI 陪伴系統)
- **授權條款**：MIT License