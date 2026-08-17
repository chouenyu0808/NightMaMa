"""Centralized environment-variable settings (Cloud Run injects these; local dev uses .env)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gcp_project_id: str = ""
    google_maps_api_key: str = ""
    gemini_api_key: str = ""
    geocoding_api_key: str = ""  # optional: separate GCP project/key for the one-off bulk geocode script
    bq_dataset: str = "nightmama"  # unsafe_reports lives here
    bq_dataset_lights: str = "LIGHT_TAIPEI"
    bq_table_lights: str = "StreetLight"
    bq_dataset_cameras: str = "cctv"
    bq_table_cameras: str = "cctv"
    pubsub_topic_sos: str = "sos-triggered"

    # 預設只允許本機開發來源。/score 與 /routes 每次呼叫都會產生 BigQuery 與
    # Places API 費用，開放 "*" 等於讓任何網站都能從訪客瀏覽器燒你的額度。
    # 部署時請用環境變數指定前端實際網域，例如：
    #   CORS_ORIGINS=["https://nightmama-xxxx.asia-east1.run.app"]
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]


settings = Settings()
