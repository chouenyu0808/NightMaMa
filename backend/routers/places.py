"""GET /places/nearest-store — nearest open 24h convenience store, used as a
walking waypoint for voice-triggered "route me via a store" requests."""
from fastapi import APIRouter

from models.schemas import LatLng, NearestStoreResponse
from services import places_service

router = APIRouter()


@router.get("/places/nearest-store", response_model=NearestStoreResponse)
def nearest_store(lat: float, lng: float) -> NearestStoreResponse:
    store = places_service.find_nearest_24h_store(LatLng(lat=lat, lng=lng))
    if not store:
        return NearestStoreResponse(found=False)
    return NearestStoreResponse(found=True, name=store["name"], lat=store["lat"], lng=store["lng"])
