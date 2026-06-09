"""SQLite persistence for watchlist symbols."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS watchlist_symbol (
  symbol TEXT PRIMARY KEY COLLATE NOCASE,
  added_at TEXT NOT NULL
);
"""


def _db_path() -> Path:
    root = Path(__file__).resolve().parents[2]
    data_dir = root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "watchlist.db"


@contextmanager
def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()


def normalize_symbol(s: str) -> str:
    t = s.strip().upper()
    if not t or len(t) > 16 or not t.replace(".", "").isalnum():
        raise ValueError("invalid symbol")
    return t


def list_symbols() -> list[str]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT symbol FROM watchlist_symbol ORDER BY added_at ASC, symbol ASC"
        ).fetchall()
        return [str(r["symbol"]) for r in rows]


def add_symbol(symbol: str) -> list[str]:
    sym = normalize_symbol(symbol)
    now = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO watchlist_symbol (symbol, added_at) VALUES (?, ?)",
            (sym, now),
        )
    return list_symbols()


def remove_symbol(symbol: str) -> list[str]:
    sym = normalize_symbol(symbol)
    with connect() as conn:
        conn.execute("DELETE FROM watchlist_symbol WHERE symbol = ?", (sym,))
    return list_symbols()


def seed_defaults_if_empty(defaults: tuple[str, ...] = ("AAPL", "MSFT", "GOOG")) -> None:
    with connect() as conn:
        n = conn.execute("SELECT COUNT(*) AS c FROM watchlist_symbol").fetchone()["c"]
        if n > 0:
            return
        now = datetime.now(timezone.utc).isoformat()
        for sym in defaults:
            conn.execute(
                "INSERT OR IGNORE INTO watchlist_symbol (symbol, added_at) VALUES (?, ?)",
                (sym, now),
            )
