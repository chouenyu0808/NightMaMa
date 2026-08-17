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
    cors_origins: list[str] = ["*"]


settings = Settings()
