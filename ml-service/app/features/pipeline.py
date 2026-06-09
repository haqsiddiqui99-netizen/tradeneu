"""OHLCV rows → normalized feature tensor (last ML_WINDOW bars)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import torch

from app.config import ML_WINDOW, N_FEATURES


@dataclass(frozen=True)
class BarRow:
    o: float
    h: float
    l: float
    c: float
    v: float


def _rows_to_frame(rows: list[BarRow]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "open": [r.o for r in rows],
            "high": [r.h for r in rows],
            "low": [r.l for r in rows],
            "close": [r.c for r in rows],
            "volume": [r.v for r in rows],
        },
        dtype=np.float64,
    )


def build_feature_matrix(df: pd.DataFrame) -> np.ndarray:
    """(len, N_FEATURES) — extend with cross-asset factors, order-book proxies, etc."""
    o = df["open"].to_numpy()
    h = df["high"].to_numpy()
    l = df["low"].to_numpy()
    c = df["close"].to_numpy()
    v = np.maximum(df["volume"].to_numpy(), 0.0)

    c_safe = np.where(np.abs(c) < 1e-12, 1e-12, c)
    prev = np.roll(c_safe, 1)
    prev[0] = c_safe[0]
    ret = np.log(np.maximum(c_safe / prev, 1e-12))
    ret[0] = 0.0

    hl = np.maximum(h - l, 1e-12)
    rng = np.clip((h - l) / c_safe, 0.0, 2.0)
    body = np.clip(np.abs(c - o) / hl, 0.0, 1.0)
    vol_log = np.log1p(v)
    v_mean = float(vol_log.mean())
    v_std = float(vol_log.std() + 1e-6)
    vol_z = (vol_log - v_mean) / v_std
    pos = np.clip((c - l) / hl, 0.0, 1.0)
    sgn = np.sign(ret)

    mat = np.column_stack([ret, rng, body, vol_z, pos, sgn]).astype(np.float32)
    assert mat.shape[1] == N_FEATURES
    return np.nan_to_num(mat, nan=0.0, posinf=0.0, neginf=0.0)


class FeaturePipeline:
    """Last `ML_WINDOW` bars → (1, ML_WINDOW, N_FEATURES)."""

    def build_tensor(self, rows: list[BarRow]) -> torch.Tensor:
        if len(rows) < 2:
            raise ValueError("Need at least 2 OHLCV rows.")
        df = _rows_to_frame(rows)
        feats = build_feature_matrix(df)
        if feats.shape[0] < ML_WINDOW:
            pad = ML_WINDOW - feats.shape[0]
            feats = np.vstack([np.zeros((pad, N_FEATURES), dtype=np.float32), feats])
        window = feats[-ML_WINDOW:]
        return torch.from_numpy(window).unsqueeze(0).contiguous()
