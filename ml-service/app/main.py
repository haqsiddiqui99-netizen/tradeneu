"""FastAPI ML service — PyTorch inference + feature pipelines."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as ml_router
from app.api.watchlist_routes import router as watchlist_router

app = FastAPI(
    title="Tradeneu ML",
    version="0.1.0",
    description="Heavy ML / research API (Python). Historic CSV remains on Node.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ml_router)
app.include_router(watchlist_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "tradeneu-ml", "docs": "/docs"}
