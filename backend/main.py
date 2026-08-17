"""FastAPI app entrypoint for the NightMaMa Cloud Run backend."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import places, report, routes, score, sos, speak, stream, users

app = FastAPI(title="NightMaMa Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router)
app.include_router(score.router)
app.include_router(sos.router)
app.include_router(report.router)
app.include_router(speak.router)
app.include_router(stream.router)
app.include_router(users.router)
app.include_router(places.router)


@app.get("/health")
def health() -> dict:
    """Health check. Use /health, not /healthz.

    Google's frontend intercepts /healthz on *.run.app and returns its own HTML
    404 before the request ever reaches this app, so a monitor pointed at
    /healthz reports the service as down even when it is healthy. Every other
    path routes through normally.
    """
    return {"status": "ok"}


@app.get("/healthz")
def healthz() -> dict:
    """Kept for non-Cloud-Run deployments; unreachable behind *.run.app."""
    return {"status": "ok"}
