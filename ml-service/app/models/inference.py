"""Load weights + run forward (CPU/GPU)."""

from __future__ import annotations

import logging
from pathlib import Path

import torch

from app.config import ML_WINDOW, N_FEATURES, N_CLASSES
from app.models.deep_mlp import TabularSequenceMLP

logger = logging.getLogger(__name__)

_ML_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_PATH = _ML_ROOT / "artifacts" / "model.pt"


class Predictor:
    def __init__(self) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = TabularSequenceMLP().to(self.device)
        self.model.eval()
        if ARTIFACT_PATH.is_file():
            try:
                state = torch.load(ARTIFACT_PATH, map_location=self.device, weights_only=True)
            except TypeError:
                state = torch.load(ARTIFACT_PATH, map_location=self.device)
            self.model.load_state_dict(state, strict=True)
            logger.info("Loaded weights from %s", ARTIFACT_PATH)
        else:
            logger.info("No checkpoint at %s — using initialized weights.", ARTIFACT_PATH)
        self.torch_version = torch.__version__
        self.device_str = str(self.device)
        self.model_name = "TabularSequenceMLP"

    @torch.inference_mode()
    def predict_proba(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        x = x.to(self.device, dtype=torch.float32)
        logits = self.model(x)
        probs = torch.softmax(logits, dim=-1)
        return logits.squeeze(0).cpu(), probs.squeeze(0).cpu()


_predictor: Predictor | None = None


def get_predictor() -> Predictor:
    global _predictor
    if _predictor is None:
        _predictor = Predictor()
    return _predictor
