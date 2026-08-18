"""/report — anonymous unsafe-location report, feeds BigQuery hotspot analysis
and Firestore for frontend report history/heatmap display."""
import hashlib
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, status
from google.cloud import bigquery, firestore

from clients import firestore_client
from deps import get_bigquery, get_firestore
from models.schemas import ReportListResponse, ReportRequest
from services import bigquery_service

router = APIRouter()

logger = logging.getLogger(__name__)


def _write_hotspot(bq: bigquery.Client, lat: float, lng: float, reason: str, session_hash: str) -> None:
    """把通報寫進 BigQuery，供路線評分的社區通報項使用。

    在背景執行：這是求救情境下的操作，使用者按完就要立刻看到結果，
    不該為了等 BigQuery 回應而卡住。失敗只記錄不重試 —— 單筆通報遺失
    可以接受，但整條路徑壞掉時必須在日誌裡看得出來，
    否則會像先前那樣「通報看起來成功、評分完全沒吃到」而沒人發現。
    """
    try:
        bigquery_service.insert_unsafe_report(bq, lat, lng, reason, session_hash)
    except Exception:  # noqa: BLE001 - 背景任務不能讓例外逸出
        logger.exception("寫入 unsafe_reports 失敗，該筆通報不會納入路線評分")


@router.post("/report", status_code=status.HTTP_202_ACCEPTED)
def report_unsafe_location(
    req: ReportRequest,
    background: BackgroundTasks,
    bq: bigquery.Client = Depends(get_bigquery),
    db: firestore.Client = Depends(get_firestore),
) -> dict:
    # session_id 只以雜湊形式留存，不寫入原值
    session_hash = hashlib.sha256(req.session_id.encode()).hexdigest()[:16]
    background.add_task(
        _write_hotspot, bq, req.lat, req.lng, req.category or req.reason, session_hash
    )
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
