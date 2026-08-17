"""Assemble SOS payload and publish to Pub/Sub for async, retryable notification."""
import json

from google.cloud import pubsub_v1

from config import settings
from models.schemas import SOSRequest


def publish_sos(publisher: pubsub_v1.PublisherClient, payload: SOSRequest) -> str:
    topic_path = publisher.topic_path(settings.gcp_project_id, settings.pubsub_topic_sos)
    future = publisher.publish(topic_path, json.dumps(payload.model_dump()).encode("utf-8"))
    return future.result(timeout=10)
