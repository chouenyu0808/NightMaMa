"""Centralized environment-variable settings (Cloud Run injects these; local dev uses .env)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gcp_project_id: str = ""
    # Firestore can live in a separate GCP project (e.g. your personal account)
    firestore_project_id: str = ""  # falls back to gcp_project_id if empty
    firestore_credentials_file: str = ""  # path to service-account JSON for Firestore only
    google_maps_api_key: str = ""
    gemini_api_key: str = ""
    geocoding_api_key: str = ""  # optional: separate GCP project/key for the one-off bulk geocode script
    bq_dataset: str = "nightmama"  # unsafe_reports lives here
    bq_dataset_lights: str = "LIGHT_TAIPEI"
    bq_table_lights: str = "StreetLight"
    bq_dataset_cameras: str = "cctv"
    bq_table_cameras: str = "cctv"
    # OSM 路網取樣點與路口，供 Prospect / Escape 評分使用
    bq_dataset_roads: str = "osm_taipei"
    bq_table_roads: str = "roads"
    bq_table_junctions: str = "junctions"
    pubsub_topic_sos: str = "sos-triggered"

    # ─── SOS 通知（Pub/Sub push → /internal/pubsub/sos）────────────────
    # LINE Messaging API 的 Channel Access Token。推播緊急聯絡人用。
    line_channel_access_token: str = ""
    # Pub/Sub push subscription 帶來的 OIDC token 必須符合這兩個值才受理。
    # 兩者任一為空時，/internal/pubsub/sos 一律回 503 並記錄錯誤 —— 這支端點
    # 會發出 LINE 訊息，設定不全就開放等於送人一個免費簡訊閘道。
    pubsub_push_audience: str = ""      # 通常就是後端 Cloud Run 服務網址
    pubsub_push_sa_email: str = ""      # 建立 subscription 時指定的服務帳號

    # 預設只允許本機開發來源。/score 與 /routes 每次呼叫都會產生 BigQuery 與
    # Places API 費用，開放 "*" 等於讓任何網站都能從訪客瀏覽器燒你的額度。
    # 部署時請用環境變數指定前端實際網域，例如：
    #   CORS_ORIGINS=["https://nightmama-xxxx.asia-east1.run.app"]
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]


settings = Settings()
