"""Example deep MLP head — swap for Transformer / TCN / etc. as research progresses."""

from __future__ import annotations

import torch
import torch.nn as nn

from app.config import ML_WINDOW, N_CLASSES, N_FEATURES


class TabularSequenceMLP(nn.Module):
    """Flattened last `ML_WINDOW` * `N_FEATURES` → deep stack → logits."""

    def __init__(
        self,
        flat_in: int = ML_WINDOW * N_FEATURES,
        hidden: int = 256,
        depth: int = 4,
        n_classes: int = N_CLASSES,
        dropout: float = 0.15,
    ) -> None:
        super().__init__()
        layers: list[nn.Module] = []
        d = flat_in
        for i in range(depth):
            layers += [nn.Linear(d, hidden), nn.LayerNorm(hidden), nn.GELU(), nn.Dropout(dropout if i < depth - 1 else 0.0)]
            d = hidden
        layers.append(nn.Linear(d, n_classes))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, T, F)
        b = x.shape[0]
        flat = x.reshape(b, -1)
        return self.net(flat)
