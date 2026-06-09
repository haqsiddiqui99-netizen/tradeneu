/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to `1` to disable auto-start of historic API during `vite` (dev only). */
  readonly VITE_SKIP_HISTORIC_API?: string
  /** Set to `1` to disable auto-start of ML API (`uvicorn` on 8001) during `vite` (dev only). */
  readonly VITE_SKIP_ML_API?: string
  /** Optional base URL for historic gold API (e.g. https://api.example.com when not same-origin). */
  readonly VITE_HISTORIC_GOLD_API?: string
  /** Optional origin for ML API when not using Vite proxy (e.g. https://ml.example.com — no trailing slash). */
  readonly VITE_ML_API_BASE?: string
  /** Comma-separated provider chain for GET /api/market/bars (default twelvedata). */
  readonly VITE_MARKET_BAR_CHAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
