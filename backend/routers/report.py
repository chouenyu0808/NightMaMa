"""POST /report — anonymous unsafe-location report, feeds BigQuery hotspot analysis."""
import hashlib

from fastapi import APIRouter, Depends, status
from google.cloud import bigquery

from deps import get_bigquery
from models.schemas import ReportItem, ReportRequest, ReportsResponse
from services import bigquery_service

router = APIRouter()


@router.post("/report", status_code=status.HTTP_202_ACCEPTED)
def report_unsafe_location(req: ReportRequest, bq: bigquery.Client = Depends(get_bigquery)) -> dict:
    session_hash = hashlib.sha256(req.session_id.encode()).hexdigest()[:16]
    bigquery_service.insert_unsafe_report(bq, req.lat, req.lng, req.reason, session_hash)
    return {"status": "accepted"}


@router.get("/report", response_model=ReportsResponse)
def list_unsafe_locations(bq: bigquery.Client = Depends(get_bigquery)) -> ReportsResponse:
    rows = bigquery_service.list_unsafe_reports(bq)
    return ReportsResponse(reports=[ReportItem(**r) for r in rows])
