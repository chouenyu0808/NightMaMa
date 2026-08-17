# 🌙 NightMaMa (LumiMaMa) — 夜間安全導航 · AI 守護每一步

> **專為夜間步行族群（女性、學生、加班夜歸族）設計的智慧夜間安全導航與 Google Gemini AI 雙向語音陪伴平台。**

![Next.js](https://img.shields.io/badge/Next.js-14_App_Router-000000?style=for-the-badge&logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)
![Google Maps](https://img.shields.io/badge/Google_Maps-Routes_API_v2-4285F4?style=for-the-badge&logo=googlemaps)
![Gemini AI](https://img.shields.io/badge/Google_Gemini-3.6_Flash-8E75FF?style=for-the-badge&logo=googlegemini)
![GCP Cloud Run](https://img.shields.io/badge/GCP-Cloud_Run-4285F4?style=for-the-badge&logo=googlecloud)
![LINE Notify](https://img.shields.io/badge/LINE-Notify_Emergency-00B900?style=for-the-badge&logo=line)

---

## 📖 專案簡介 (About NightMaMa)

**NightMaMa** 旨在解決獨自夜間步行時對「暗巷死角、缺乏治安監視器」與「孤單焦慮感」的焦慮痛點。

我們結合 **台北市 145,919 盞路燈大數據** 與 **5,036 支警察局監視器地點**，研發出專利的**夜間加權安全演算法**，不再只推薦「最快」路線，而是為使用者推薦「照明最充足、巡邏與監視覆蓋率最高」的安全明亮大路。

同時導入 **Google Gemini 3.6 Flash 大語言模型** 與 **LINE 聊天室風格語音對話介面**，在夜歸全程提供無微不至的即時陪伴與隨時應急救援（LINE 定位通報 / 模擬假電話）。

---

## ✨ 核心功能亮點 (Core Features)

### 1. 🛡️ 夜間加權安全演算法 (Night Safety Scoring Engine)
- **高密度等距採樣**：沿著 Google Routes 路線每 25 公尺進行微觀空間掃描。
- **照明與監視加權**：統計半徑 30m 內的路燈點位與警察局 CCTV 密度，計算出 `0 ~ 100` 分的安全品質指標。
- **多路線對比**：提供 `🟢 最安全`、`🔵 平衡` 與 `⚡ 最快` 三種路線切換。

### 2. 🧭 Google 3D Turn-by-Turn 導航與 Heading-UP 視角旋轉
- **原生導航介面**：頂部 Google 墨綠導航 Banner（`#024738`），提示目前街道與下一步轉彎預告。
- **Heading-UP 方位旋轉**：地圖視角隨著使用者實體行走面朝方向即時旋轉，永遠保持「人朝向的方向朝上」。
- **動態軌跡裁切與自動偏離重算**：藍色點陣軌跡隨步伐即時縮短；偏離路線 > 60m 時自動重新算路。
- **5 ~ 15 步詳細轉彎指引**：自動幾何角度分析演算法，生成完整的直行、轉彎與抵達指引。

### 3. 💚 LINE 聊天室風格 Gemini 3.6 Flash 實時 AI 語音陪聊 (`/companion`)
- **1:1 復刻 LINE 介面**：天空藍壁紙、LINE 亮綠對話氣泡 (`#86E260`)、已讀狀態與時間戳記。
- **極速動態 AI 回應**：接入最新 **Gemini 3.6 Flash** API，0.5 秒內生成溫暖且符合當前路線上下文的即時回答。
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
4. 🎙️ **Gemini 3.6 Flash AI 雙向語音陪伴流程圖** (Voice Companion Flowchart)
5. 🆘 **一鍵 SOS 通報與假電話流程圖** (Emergency Flowchart)

---

## 🛠️ 技術堆疊 (Tech Stack)

| 領域 | 技術 / 服務 |
| :--- | :--- |
| **前端框架** | Next.js 14 (App Router), TypeScript, Vanilla CSS (CSS Variables) |
| **導航與地圖** | Google Maps JavaScript SDK, Google Routes API v2 REST |
| **AI 大語言模型** | Google Gemini 3.6 Flash (`generativelanguage.googleapis.com`) |
| **語音互動** | Web Speech API (`SpeechSynthesis` & `SpeechRecognition`) |
| **緊急通報** | LINE Notify API |
| **雲端部署** | GCP Cloud Run, Multi-stage Docker Container |

---

## 📊 開發數據來源 (Open Data)

- **台北市路燈資訊**：全台北市 145,919 盞路燈點位座標 (`frontend/public/data/streetlights.json`)
- **台北市警察局與市府監視器**：5,036 支 CCTV 監視器地理座標（解析警察局公開 PDF 檔案 `data/上傳-115上本局錄影監視統設置區位.pdf` 匯入 `cctv.json`）

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
在 `frontend/` 資料夾下建立 `.env.local` 檔案：
```env
NEXT_PUBLIC_GOOGLE_MAPS_KEY=YOUR_GOOGLE_MAPS_API_KEY
NEXT_PUBLIC_GEMINI_KEY=YOUR_GEMINI_API_KEY
```

### 4. 啟動開發伺服器
```bash
npm run dev
```
打開瀏覽器存取 **[http://localhost:3000](http://localhost:3000)** 即可體驗。

---

## ☁️ GCP Cloud Run 雲端部署 (Deployment)

專案根目錄已配置 Dockerfile，支援自動建置並部署至 GCP Cloud Run：

```bash
# 建置並部署至 GCP Cloud Run
cd frontend
./deploy.sh
```

- **線上展示網址**：[https://nightmama-321739351322.asia-east1.run.app](https://nightmama-321739351322.asia-east1.run.app)

---

## 📄 專案團隊與授權 (License)

- **專案名稱**：NightMaMa (夜間安全導航 · AI 陪伴系統)
- **授權條款**：MIT License