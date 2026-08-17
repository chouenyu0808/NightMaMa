# 🌙 NightMaMa 夜間安全導航與 AI 虛擬陪伴系統 - 架構與流程圖文件

本文件詳細記錄 **LumiMAMA / NightMaMa** 的整體系統架構、夜間安全加權演算法、Google Maps Turn-by-Turn 導航、Gemini 3.6 Flash 雙向語音陪伴及 SOS 應急通報之完整流程圖。

---

## 1. 🏗️ 系統總體架構圖 (System Architecture)

```mermaid
graph TD
    Client["📱 手機網頁版 PWA (Next.js 14 App Router)"]

    subgraph Frontend["前端層 (Frontend Layer)"]
        UI_Landing["🏠 首頁與星空視覺 (Landing)"]
        UI_Map["🗺️ 互動地圖與安全路線搜尋 (Map & Routes)"]
        UI_Nav["🧭 Google 導航與即時定位 (Turn-by-Turn Nav)"]
        UI_Voice["🎙️ Gemini 3.6 AI 語音陪聊 (Voice Companion)"]
        UI_SOS["🆘 一鍵 SOS 與假電話 (Emergency System)"]
    end

    subgraph Engine["核心演算法與服務代理層 (Core Engine & Proxies)"]
        SafetyEngine["⚖️ 安全權重計算引擎 (lib/safetyScore.ts)"]
        RouteProxy["🛣️ Routes API Proxy (/api/routes)"]
        GeminiProxy["🧠 Gemini 3.6 Flash Proxy (/api/companion)"]
        LineProxy["📩 LINE Notify Proxy (/api/line-notify)"]
    end

    subgraph DataExternal["數據與外部 API 層 (Data & Cloud APIs)"]
        Data_Lights["💡 台北市 145,919 盞路燈 (streetlights.json)"]
        Data_CCTV["📹 警察局與市府 5,036 支監視器 (cctv.json)"]
        API_GoogleRoutes["🗺️ Google Routes API v2 (WALK Mode)"]
        API_Gemini["✨ Google Gemini 3.6 Flash Model"]
        API_Line["📱 LINE Notify API"]
    end

    Client --> Frontend
    UI_Map --> SafetyEngine
    UI_Map --> RouteProxy
    UI_Nav --> API_GoogleRoutes
    UI_Voice --> GeminiProxy
    UI_SOS --> LineProxy

    SafetyEngine --> Data_Lights
    SafetyEngine --> Data_CCTV
    RouteProxy --> API_GoogleRoutes
    GeminiProxy --> API_Gemini
    LineProxy --> API_Line
```

---

## 2. ⚖️ 夜間加權安全演算法流程圖 (Night Safety Scoring Engine)

本演算法捨棄傳統「僅求最快」導航，改採**高照明度 (路燈)**、**高巡邏監視密度 (CCTV)** 為權重計算標準：

```mermaid
flowchart TD
    Start(["開始路線安全評分"]) --> FetchData["載入 145,919 盞路燈 & 5,036 支監視器座標"]
    FetchData --> FetchRoute["向 Google Routes API 取得步行路線 (Polyline)"]
    FetchRoute --> SamplePoints["延 Polyline 每隔 25 公尺進行高密度等距採樣 (30~50 點)"]

    SamplePoints --> LoopPoints{"遍歷每一個採樣點 (Sample Point)"}

    LoopPoints --> SpatialSearch["以半徑 R (30公尺) 進行空間搜尋"]
    SpatialSearch --> CountLights["統計半徑內路燈數量 N_light (權重: +15分/盞, 上限45)"]
    SpatialSearch --> CountCCTV["統計半徑內監視器數量 N_cctv (權重: +20分/支, 上限35)"]

    CountLights & CountCCTV --> SumPointScore["計算採樣點基礎分數 = Min(100, N_light*15 + N_cctv*20)"]
    SumPointScore --> NextPoint["下一點"]

    NextPoint --> LoopPoints
    LoopPoints -- "完成所有點採樣" --> CalcAvg["計算全線平均基礎分 AvgScore"]

    CalcAvg --> PenaltyDuration{"路線額外繞路時間 penaltyMin"}
    PenaltyDuration -- "> 3 分鐘" --> ApplyPenalty["扣除繞路時間懲罰: AvgScore - (penaltyMin * 2)"]
    PenaltyDuration -- "<= 3 分鐘" --> NoPenalty["保持分數"]

    ApplyPenalty & NoPenalty --> FinalScore["得出最終安全分數 (Total Safety Score: 0~100)"]

    FinalScore --> ClassifyRoute{"評級分類"}
    ClassifyRoute -- "Score >= 85" --> ScoreGreen["🟢 最安全路線 (高路燈+高監視)"]
    ClassifyRoute -- "65 <= Score < 85" --> ScoreBlue["🔵 平衡路線 (兼顧速度與安全)"]
    ClassifyRoute -- "Score < 65" --> ScoreOrange["🟠 最快路線 (可能包含暗巷死角)"]

    ScoreGreen & ScoreBlue & ScoreOrange --> End(["地圖繪製與高亮顯示"])
```

---

## 3. 🧭 Google Maps Turn-by-Turn 導航與即時 GPS 追蹤流程圖

導航模式實現面朝方向朝上 (`Heading UP`) 旋轉與實時動態裁切：

```mermaid
flowchart TD
    StartNav(["進入 3D 導航模式 (/navigate)"]) --> InitMap["初始化 3D 斜角地圖 (Tilt 45°, Zoom 18)"]
    InitMap --> ParseSteps{"檢查 URL 轉彎指引數據 (steps)"}

    ParseSteps -- "無預先步驟" --> AutoGenSteps["動態幾何演算法分析 Polyline 夾角<br/>自動生成 5~15 步轉彎指引 (右轉/左轉/直行)"]
    ParseSteps -- "有步驟數據" --> LoadSteps["載入詳細轉彎清單 (NavSteps)"]

    AutoGenSteps & LoadSteps --> WatchGPS["啟動 GPS 地理定位監聽 (watchPosition)"]

    WatchGPS --> GPSUpdate["收到最新 GPS 座標 (lat, lng) & 方位角 (heading)"]

    GPSUpdate --> CalcDistance["1. 算目前座標至目的地之 Haversine 剩餘距離"]
    CalcDistance --> UpdateETA["2. 動態算剩餘分鐘數 & 預計抵達時間 (ETA)"]

    UpdateETA --> CheckOffRoute{"3. 檢查離線距離是否 > 60 公尺？"}

    CheckOffRoute -- "是 (偏離路線)" --> ReRoute["背景自動發起 Routes API<br/>以當前 GPS 為起點重新計算路線"]
    ReRoute --> UpdatePolyline["更新地圖軌跡 (Polyline)"]

    CheckOffRoute -- "否 (正常行走)" --> ClipPolyline["動態裁切 Polyline<br/>將軌跡起點即時對齊至使用者最新位置"]

    UpdatePolyline & ClipPolyline --> CheckHeading{"4. 視角旋轉 (Heading UP)"}

    CheckHeading --> MapRotate["地圖視角自動旋轉至使用者面朝方向<br/>(map.setHeading(userHeading))"]

    MapRotate --> CheckStepProximity{"5. 是否靠近下一個轉彎口 (< 20m)？"}

    CheckStepProximity -- "是" --> AdvanceStep["自動推進至下一轉彎步驟<br/>+ Web Speech 語音播報轉彎指示"]
    CheckStepProximity -- "否" --> LoopGPS["等待下一秒 GPS 訊號"]

    AdvanceStep --> LoopGPS
    LoopGPS --> WatchGPS
```

---

## 4. 🎙️ Gemini 3.6 Flash AI 雙向語音陪伴流程圖

```mermaid
flowchart LR
    UserSpeech["👤 使用者說話或點擊快捷按鈕<br/>(例如：附近有超商嗎？)"] --> STT["🎤 Web Speech Recognition<br/>(語音轉文字)"]
    STT --> SendAPI["🚀 POST /api/companion<br/>(夾帶路線上下文)"]

    SendAPI --> Gemini36["✨ Google Gemini 3.6 Flash Model<br/>(generativelanguage.googleapis.com)"]

    Gemini36 --> GenerateResponse["🧠 AI 根據路線安全分數、超商、路燈數量<br/>生成 25 字以內溫暖貼心繁中回應"]

    GenerateResponse --> ReceiveReply["📩 前端接收 AI 回應文字"]

    ReceiveReply --> TTS["🔊 Web Speech Synthesis<br/>(篩選台灣溫柔女聲, Pitch 1.25, Rate 0.95)"]

    TTS --> AudioOut["🔈 手機擴音播報溫暖語音陪伴"]
```

---

## 5. 🆘 一鍵 SOS 緊急通報流程圖

```mermaid
flowchart TD
    Trigger["👤 使用者按壓 SOS 按鈕或觸發緊急情境"] --> SelectAction{"選擇緊急功能"}

    SelectAction -- "模擬假電話 (Fake Call)" --> UI_FakeCall["📱 顯示真實 iPhone 來電畫面<br/>播放模擬親友對話錄音，嚇阻跟蹤者"]

    SelectAction -- "110 / 113 報警" --> UI_Hotline["📞 直接發起 110 / 113 電話撥號"]

    SelectAction -- "LINE 通報緊急聯絡人" --> CallLineAPI["📩 POST /api/line-notify"]

    CallLineAPI --> FormatMsg["格式化緊急求救簡訊:<br/>🚨 警報！使用者發起夜間 SOS 求救！<br/>📍 當前座標與 Google 地圖連結<br/>🛡️ 當前路線安全評分"]

    FormatMsg --> LineServer["📱 LINE Notify 官方伺服器"]
    LineServer --> FamilyNotify["🔔 聯絡人 LINE 即時收到求救推播與定位網址"]
```

---

> 專案名稱：NightMaMa — 夜間安全導航與 AI 虛擬陪伴系統
