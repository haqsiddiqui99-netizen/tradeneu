/**
 * Unified market data store — routes reads/writes to TimescaleDB or SQLite.
 *
 * Backend selection (`MARKET_STORE`):
 *   auto   — Timescale when DATABASE_URL/TIMESCALE_DATABASE_URL is set, else SQLite (default)
 *   timescale — force TimescaleDB
 *   sqlite — force local SQLite (Phase 1)
 */

import * as sqlite from './marketLocalDb.mjs'
import * as timescale from './marketTimescaleDb.mjs'

export { BAR_TIMEFRAMES } from './marketLocalDb.mjs'

export function marketStoreBackend() {
  const forced = process.env.MARKET_STORE?.trim().toLowerCase()
  if (forced === 'sqlite') return 'sqlite'
  if (forced === 'timescale') return 'timescale'
  if (timescale.marketTimescaleConfigured() && timescale.marketTimescaleEnabled()) return 'timescale'
  return 'sqlite'
}

export function marketStoreEnabled() {
  const backend = marketStoreBackend()
  if (backend === 'timescale') return timescale.marketTimescaleEnabled()
  return sqlite.marketLocalEnabled()
}

/** @deprecated Use marketStoreEnabled — kept for existing imports. */
export function marketLocalEnabled() {
  return marketStoreEnabled()
}

export function marketLocalFallbackDukascopy() {
  return sqlite.marketLocalFallbackDukascopy()
}

export function marketDbPath() {
  return sqlite.marketDbPath()
}

export function normalizeMarketSymbol(symbol) {
  return sqlite.normalizeMarketSymbol(symbol)
}

export function chartIntervalToLocalTimeframe(interval) {
  return sqlite.chartIntervalToLocalTimeframe(interval)
}

function backendModule() {
  return marketStoreBackend() === 'timescale' ? timescale : sqlite
}

export async function initMarketStore() {
  if (marketStoreBackend() === 'timescale') {
    await timescale.initTimescaleSchema()
    return { backend: 'timescale' }
  }
  sqlite.getMarketDb()
  return { backend: 'sqlite' }
}

export async function closeMarketStore() {
  await timescale.closeTimescalePool()
  sqlite.closeMarketDb()
}

export async function insertTicks(symbol, ticks) {
  return backendModule().insertTicks(symbol, ticks)
}

export async function insertBars(symbol, timeframe, bars) {
  return backendModule().insertBars(symbol, timeframe, bars)
}

export async function recordSyncManifest(manifest) {
  return backendModule().recordSyncManifest(manifest)
}

export async function readLocalTicks(symbol, startSec, endSec, limit, cursorMs) {
  return backendModule().readLocalTicks(symbol, startSec, endSec, limit, cursorMs)
}

export async function readLocalBars(symbol, timeframe, startSec, endSec) {
  return backendModule().readLocalBars(symbol, timeframe, startSec, endSec)
}

export async function countLocalTicksInRange(symbol, startSec, endSec) {
  return backendModule().countLocalTicksInRange(symbol, startSec, endSec)
}

export async function getLocalBarTimeBounds(symbol, timeframe) {
  return backendModule().getLocalBarTimeBounds(symbol, timeframe)
}

export async function countLocalBarsInRange(symbol, timeframe, startSec, endSec) {
  return backendModule().countLocalBarsInRange(symbol, timeframe, startSec, endSec)
}

export async function readLocalTicksBulk(symbol, startSec, endSec, maxRows) {
  return backendModule().readLocalTicksBulk(symbol, startSec, endSec, maxRows)
}

export async function localChunkSatisfied(symbol, kind, startSec, endSec) {
  return backendModule().localChunkSatisfied(symbol, kind, startSec, endSec)
}

export async function getLocalStoreStats(symbol) {
  const stats = await backendModule().getLocalStoreStats(symbol)
  return { ...stats, backend: marketStoreBackend() }
}

export async function pruneLocalRetention(symbol) {
  return backendModule().pruneLocalRetention(symbol)
}

export function resolveDefaultMarketBarChain() {
  const custom = process.env.MARKET_BAR_CHAIN?.trim()
  if (custom) return custom
  if (marketStoreBackend() === 'timescale') return 'timescale,dukascopy,twelvedata'
  return 'local,dukascopy,twelvedata'
}

export async function testMarketStoreConnection() {
  if (marketStoreBackend() === 'timescale') return timescale.testTimescaleConnection()
  sqlite.getMarketDb()
  return { ok: true, backend: 'sqlite', path: sqlite.marketDbPath() }
}
