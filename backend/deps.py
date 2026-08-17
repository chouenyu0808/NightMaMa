"""Shared FastAPI dependencies — lazily-constructed GCP clients, reused across requests."""
from functools import lru_cache
from pathlib import Path

from google.cloud import bigquery, firestore, pubsub_v1
from google.oauth2 import service_account

from config import settings

# Resolve relative credential paths against this file's directory (backend/)
_BASE_DIR = Path(__file__).resolve().parent


@lru_cache
def get_firestore() -> firestore.Client:
    """Firestore client — supports a separate project/credentials from the main GCP project."""
    project = settings.firestore_project_id or settings.gcp_project_id or None
    if settings.firestore_credentials_file:
        cred_path = Path(settings.firestore_credentials_file)
        if not cred_path.is_absolute():
            cred_path = _BASE_DIR / cred_path
        credentials = service_account.Credentials.from_service_account_file(str(cred_path))
        return firestore.Client(project=project, credentials=credentials)
    return firestore.Client(project=project)


@lru_cache
def get_bigquery() -> bigquery.Client:
    return bigquery.Client(project=settings.gcp_project_id or None)


@lru_cache
def get_publisher() -> pubsub_v1.PublisherClient:
    return pubsub_v1.PublisherClient()
