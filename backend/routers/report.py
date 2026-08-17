"""/report — anonymous unsafe-location report, feeds BigQuery hotspot analysis
and Firestore for frontend report history/heatmap display."""
import hashlib

from fastapi import APIRouter, Depends, status
from google.cloud import bigquery, firestore

from clients import firestore_client
from deps import get_bigquery, get_firestore
from models.schemas import ReportListResponse, ReportRequest
from services import bigquery_service

router = APIRouter()


@router.post("/report", status_code=status.HTTP_202_ACCEPTED)
def report_unsafe_location(
    req: ReportRequest,
    bq: bigquery.Client = Depends(get_bigquery),
    db: firestore.Client = Depends(get_firestore),
) -> dict:
    session_hash = hashlib.sha256(req.session_id.encode()).hexdigest()[:16]
    bigquery_service.insert_unsafe_report(bq, req.lat, req.lng, req.reason, session_hash)
    record = firestore_client.add_report(
        db,
        lat=req.lat,
        lng=req.lng,
        category=req.category or req.reason,
        address=req.address,
        user_id=req.user_id,
    )
    return {"status": "accepted", "report": record}


@router.get("/report", response_model=ReportListResponse)
def list_reports(limit: int = 50, db: firestore.Client = Depends(get_firestore)) -> ReportListResponse:
    reports = firestore_client.list_reports(db, limit=limit)
    return ReportListResponse(reports=reports)
