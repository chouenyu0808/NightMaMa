"""POST /score — safety scores for polylines the caller already has.

The frontend plans routes with the Google Directions JS SDK because it needs
turn-by-turn steps and transit legs, which the Routes API call behind /routes
does not return. This endpoint lets it keep that geometry and ask only for the
real Lighting/CCTV/Safe-Haven numbers, instead of inventing them client-side.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from google.cloud import bigquery

from deps import get_bigquery
from models.schemas import ScoreRequest, ScoreResponse, ScoredRouteItem
from services import route_scoring

router = APIRouter()

# One request carries every candidate route for a single search. Google returns
# a handful of alternatives, so anything much larger is a misuse of the endpoint
# (each extra polyline widens the BigQuery cross join and adds Places calls).
MAX_ROUTES_PER_REQUEST = 8


@router.post("/score", response_model=ScoreResponse)
def score_routes(req: ScoreRequest, bq: bigquery.Client = Depends(get_bigquery)) -> ScoreResponse:
    if not req.polylines:
        return ScoreResponse(scores=[])

    if len(req.polylines) > MAX_ROUTES_PER_REQUEST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"一次最多只能評分 {MAX_ROUTES_PER_REQUEST} 條路線",
        )

    try:
        scored = route_scoring.score_polylines(bq, req.polylines)
    except Exception as exc:  # noqa: BLE001 - surface a clean error, log the detail
        # A malformed polyline decodes to garbage rather than raising, so this
        # mostly catches BigQuery/Places failures. The frontend treats a failed
        # score as "unknown" and must not fall back to made-up numbers.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="安全評分計算失敗",
        ) from exc

    return ScoreResponse(
        scores=[
            ScoredRouteItem(
                score=s.score,
                light_count=s.light_count,
                camera_count=s.camera_count,
                police_count=s.police_count,
                store_count=s.store_count,
                segment_scores=s.segment_scores,
            )
            for s in scored
        ]
    )
