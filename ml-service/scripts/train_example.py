"""
Train TabularSequenceMLP on synthetic sequences (proves stack + writes checkpoint).

  cd ml-service
  python scripts/train_example.py

Writes: ml-service/artifacts/model.pt
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch
import torch.nn as nn

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from app.config import ML_WINDOW, N_CLASSES, N_FEATURES  # noqa: E402
from app.models.deep_mlp import TabularSequenceMLP  # noqa: E402

ART = _ROOT / "artifacts" / "model.pt"


def main() -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = TabularSequenceMLP().to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3)
    loss_fn = nn.CrossEntropyLoss()

    torch.manual_seed(42)
    n = 512
    x = torch.randn(n, ML_WINDOW, N_FEATURES, device=device)
    y = torch.randint(0, N_CLASSES, (n,), device=device)

    model.train()
    for epoch in range(8):
        opt.zero_grad()
        logits = model(x)
        loss = loss_fn(logits, y)
        loss.backward()
        opt.step()
        if epoch % 2 == 0:
            print(f"epoch {epoch} loss {loss.item():.4f}")

    ART.parent.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), ART)
    print(f"Wrote {ART}")


if __name__ == "__main__":
    main()
