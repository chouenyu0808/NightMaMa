"""Centralized environment-variable settings (Cloud Run injects these; local dev uses .env)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gcp_project_id: str = ""
    google_maps_api_key: str = ""
    gemini_api_key: str = ""
    bq_dataset: str = "nightmama"
    pubsub_topic_sos: str = "sos-triggered"
    cors_origins: list[str] = ["*"]


settings = Settings()
