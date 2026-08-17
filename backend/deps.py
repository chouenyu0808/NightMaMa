"""Shared FastAPI dependencies — lazily-constructed GCP clients, reused across requests."""
from functools import lru_cache

from google.cloud import bigquery, firestore, pubsub_v1

from config import settings


@lru_cache
def get_firestore() -> firestore.Client:
    return firestore.Client(project=settings.gcp_project_id or None)


@lru_cache
def get_bigquery() -> bigquery.Client:
    return bigquery.Client(project=settings.gcp_project_id or None)


@lru_cache
def get_publisher() -> pubsub_v1.PublisherClient:
    return pubsub_v1.PublisherClient()
