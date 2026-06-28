/**
 * Vercel serverless entry — all `/api/*` requests rewrite here (see vercel.json).
 * Local dev still uses `npm run server:historic` or the Vite sidecar proxy.
 */
import app from '../server/historicGoldApi.mjs'

export default app
