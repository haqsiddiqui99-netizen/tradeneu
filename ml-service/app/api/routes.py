from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.features.pipeline import BarRow, FeaturePipeline
from app.models.inference import get_predictor

router = APIRouter(tags=["ml"])


class HealthOut(BaseModel):
    ok: bool = True
    torch: str
    device: str
    model: str


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    pred = get_predictor()
    return HealthOut(torch=pred.torch_version, device=pred.device_str, model=pred.model_name)


class PredictIn(BaseModel):
    bars: list[list[float]] = Field(
        ...,
        description="Each row: open, high, low, close, volume (5 floats), oldest first.",
        min_length=4,
    )


class PredictOut(BaseModel):
    logits: list[float]
    probs: list[float]
    feature_dim: int
    window_used: int


@router.post("/v1/predict", response_model=PredictOut)
def predict(body: PredictIn) -> PredictOut:
    try:
        rows = [BarRow(o=float(r[0]), h=float(r[1]), l=float(r[2]), c=float(r[3]), v=float(r[4])) for r in body.bars]
    except (IndexError, TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid bars: {e}") from e

    pipe = FeaturePipeline()
    try:
        x = pipe.build_tensor(rows)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    pred = get_predictor()
    logits, probs = pred.predict_proba(x)
    return PredictOut(
        logits=[float(logits[i]) for i in range(logits.numel())],
        probs=[float(probs[i]) for i in range(probs.numel())],
        feature_dim=int(x.shape[-1]),
        window_used=int(x.shape[1]),
    )


class ResearchEchoIn(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


@router.post("/v1/research/echo")
def research_echo(body: ResearchEchoIn) -> dict[str, Any]:
    return {
        "received_keys": list(body.payload.keys()),
        "note": "Extend with Celery/RQ, Ray Train, or batch feature jobs.",
    }
