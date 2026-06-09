"""Watchlist helpers via yfinance (last close / change % only — chart OHLCV is on Node + Twelve Data)."""

from __future__ import annotations

import yfinance as yf


def _quote_from_history(sym: str) -> dict:
    try:
        t = yf.Ticker(sym)
        h = t.history(period="10d", interval="1d", auto_adjust=False)
        if h is None or h.empty or "Close" not in h.columns:
            return {"symbol": sym, "last": None, "changePct": None, "currency": "USD"}
        closes = h["Close"].dropna()
        if closes.empty:
            return {"symbol": sym, "last": None, "changePct": None, "currency": "USD"}
        last = float(closes.iloc[-1])
        prev = float(closes.iloc[-2]) if len(closes) >= 2 else last
        chg = None
        if prev and prev == prev and last == last:
            chg = round((last - prev) / prev * 100.0, 3)
        return {"symbol": sym, "last": round(last, 4), "changePct": chg, "currency": "USD"}
    except Exception:
        return {"symbol": sym, "last": None, "changePct": None, "currency": "USD"}


def fetch_day_quotes(symbols: list[str]) -> list[dict]:
    """Daily last close and session change % for watchlist."""
    cleaned = [s.strip().upper() for s in symbols if s.strip()]
    return [_quote_from_history(sym) for sym in cleaned]
