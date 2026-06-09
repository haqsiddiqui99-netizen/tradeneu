from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.market.yahoo import fetch_day_quotes
from app.watchlist import store

router = APIRouter(tags=["watchlist"])


class WatchlistOut(BaseModel):
    symbols: list[str]


class WatchlistQuotesOut(BaseModel):
    quotes: list[dict]


class AddSymbolIn(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=16)


@router.get("/v1/watchlist", response_model=WatchlistOut)
def watchlist_get() -> WatchlistOut:
    store.seed_defaults_if_empty()
    return WatchlistOut(symbols=store.list_symbols())


@router.post("/v1/watchlist", response_model=WatchlistOut)
def watchlist_add(body: AddSymbolIn) -> WatchlistOut:
    try:
        syms = store.add_symbol(body.symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return WatchlistOut(symbols=syms)


@router.delete("/v1/watchlist/{symbol}", response_model=WatchlistOut)
def watchlist_delete(symbol: str) -> WatchlistOut:
    try:
        syms = store.remove_symbol(symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return WatchlistOut(symbols=syms)


@router.get("/v1/watchlist/quotes", response_model=WatchlistQuotesOut)
def watchlist_quotes() -> WatchlistQuotesOut:
    store.seed_defaults_if_empty()
    syms = store.list_symbols()
    quotes = fetch_day_quotes(syms)
    return WatchlistQuotesOut(quotes=quotes)
