/**
 * Shared XAU/GC OHLCV CSV parsing (Node). Used by import-xau-csv.mjs and server/historicGoldApi.mjs.
 */

/** Split CSV/TSV row respecting quoted fields */
function splitRow(line, delim) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQ = !inQ
      continue
    }
    if (!inQ && c === delim) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur.trim())
  return out
}

function normCell(s) {
  return s.replace(/^\ufeff/, '').replace(/^["']|["']$/g, '').trim()
}

function normHeader(h) {
  return normCell(h)
    .toLowerCase()
    .replace(/[<>]/g, '')
    .replace(/\s+/g, '')
}

export function detectDelim(firstLine) {
  const tabs = (firstLine.match(/\t/g) || []).length
  const commas = (firstLine.match(/,/g) || []).length
  if (tabs >= 2 && tabs >= commas) return '\t'
  return ','
}

function normalizeDatePart(d) {
  const s = normCell(d)
  const m = s.match(/^(\d{4})\.(\d{2})\.(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m2) return s
  const m3 = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`
  return s.replace(/\./g, '-')
}

function parseEuDateTimeToUnixSec(s) {
  const raw = normCell(s).replace(/\s*UTC\s*$/i, '').trim()
  const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/)
  if (!m) return NaN
  const dd = m[1].padStart(2, '0')
  const mo = m[2].padStart(2, '0')
  const yyyy = m[3]
  const hh = m[4].padStart(2, '0')
  const mi = m[5]
  const ss = m[6]
  const frac = m[7] ? String(m[7]).padEnd(3, '0').slice(0, 3) : '000'
  const iso = `${yyyy}-${mo}-${dd}T${hh}:${mi}:${ss}.${frac}Z`
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN
}

function parseTimeToUnixSec(dateStr, timeStr, combinedStr) {
  if (combinedStr && !dateStr && !timeStr) {
    const c = normCell(combinedStr)
    if (/^\d{10,13}$/.test(c)) {
      const n = Number(c)
      return n > 1e12 ? Math.floor(n / 1000) : n
    }
    const eu = parseEuDateTimeToUnixSec(c)
    if (Number.isFinite(eu)) return eu
    const t = Date.parse(c.replace(' ', 'T').replace(/(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3'))
    if (Number.isFinite(t)) return Math.floor(t / 1000)
  }
  const d = normalizeDatePart(dateStr || '')
  const tm = normCell(timeStr || '')
  if (d && tm) {
    const iso = `${d}T${tm.length <= 5 ? tm + ':00' : tm}Z`
    const t = Date.parse(iso)
    if (Number.isFinite(t)) return Math.floor(t / 1000)
    const t2 = Date.parse(`${d} ${tm}`)
    if (Number.isFinite(t2)) return Math.floor(t2 / 1000)
  }
  const tEu = parseEuDateTimeToUnixSec(combinedStr)
  if (Number.isFinite(tEu)) return tEu
  const t3 = Date.parse(normCell(combinedStr))
  if (Number.isFinite(t3)) return Math.floor(t3 / 1000)
  return NaN
}

function buildColumnMap(header, delim) {
  const cells = splitRow(header, delim).map(normCell)
  const nh = cells.map(normHeader)
  const exact = (...names) => {
    for (const n of names) {
      const j = nh.findIndex((h) => h === n)
      if (j >= 0) return j
    }
    return -1
  }
  const loose = (...names) => {
    for (const n of names) {
      const j = nh.findIndex((h) => h === n || h.includes(n))
      if (j >= 0) return j
    }
    return -1
  }
  const date = exact('date')
  const time = exact('time')
  let dt = exact('datetime', 'timestamp', 'gmt', 'gmttime')
  if (dt < 0) dt = loose('timestamp', 'datetime')
  if (date >= 0 && time >= 0) dt = -1
  return {
    date,
    time,
    dt,
    open: loose('open'),
    high: loose('high'),
    low: loose('low'),
    close: loose('close', 'last', 'adjclose'),
    vol: loose('tickvol', 'tickvolume', 'volume', 'vol', 'realvolume'),
    cells,
  }
}

function rowTimeSec(row, map, delim) {
  const cells = splitRow(row, delim).map(normCell)
  if (map.date >= 0 && map.time >= 0 && cells[map.date] && cells[map.time]) {
    const u = parseTimeToUnixSec(cells[map.date], cells[map.time], '')
    if (Number.isFinite(u)) return u
  }
  if (map.dt >= 0 && cells[map.dt]) {
    const u = parseTimeToUnixSec('', '', cells[map.dt])
    if (Number.isFinite(u)) return u
  }
  if (map.time >= 0 && cells[map.time]) {
    const raw = cells[map.time]
    if (/^\d{10,13}$/.test(raw)) {
      const n = Number(raw)
      return n > 1e12 ? Math.floor(n / 1000) : n
    }
    const u = parseTimeToUnixSec('', '', raw)
    if (Number.isFinite(u)) return u
  }
  return NaN
}

function rowOHLCV(row, map, delim) {
  const cells = splitRow(row, delim).map(normCell)
  const num = (i) => {
    if (i < 0 || i >= cells.length) return NaN
    return Number(String(cells[i]).replace(/,/g, ''))
  }
  const o = num(map.open)
  const h = num(map.high)
  const l = num(map.low)
  const c = num(map.close)
  const v = map.vol >= 0 ? num(map.vol) : 0
  const volume =
    Number.isFinite(v) && v >= 0 ? Math.max(0, Math.round(v < 1 && v > 0 ? v * 1_000_000 : v)) : 0
  return { open: o, high: h, low: l, close: c, volume }
}

function inferTimeframeFromBars(bars) {
  if (bars.length < 8) return '1h'
  const gaps = []
  for (let i = 1; i < Math.min(120, bars.length); i++) {
    gaps.push(bars[i].time - bars[i - 1].time)
  }
  gaps.sort((a, b) => a - b)
  const med = gaps[Math.floor(gaps.length / 2)] ?? 3600
  if (med <= 90) return '1m'
  if (med <= 360) return '5m'
  if (med <= 1200) return '15m'
  if (med <= 7200) return '1h'
  if (med <= 129600) return '1D'
  return '1W'
}

/**
 * @param {string} raw
 * @param {{ maxBars?: number, delimiter?: string }} [opts]
 * @returns {{ ok: true, bars: object[], timeframe: string, barCount: number } | { ok: false, error: string }}
 */
export function parseXauCsvText(raw, opts = {}) {
  const maxBars = opts.maxBars ?? 250_000
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    return { ok: false, error: 'CSV needs a header row and at least one data row.' }
  }

  const delim = opts.delimiter || detectDelim(lines[0])
  const map = buildColumnMap(lines[0], delim)

  if (map.open < 0 || map.high < 0 || map.low < 0 || map.close < 0) {
    return {
      ok: false,
      error: `Could not find Open/High/Low/Close columns. Headers: ${map.cells.join(' | ')}`,
    }
  }
  if (map.dt < 0 && (map.date < 0 || map.time < 0)) {
    if (map.time < 0) {
      return {
        ok: false,
        error: `Could not find a time column (Datetime/Timestamp or Date+Time). Headers: ${map.cells.join(' | ')}`,
      }
    }
  }

  const bars = []
  let lastT = -1
  for (let i = 1; i < lines.length && bars.length < maxBars; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const t = rowTimeSec(line, map, delim)
    const { open, high, low, close, volume } = rowOHLCV(line, map, delim)
    if (!Number.isFinite(t) || t <= lastT) continue
    if (![open, high, low, close].every(Number.isFinite)) continue
    lastT = t
    bars.push({
      time: t,
      open: +open.toFixed(3),
      high: +high.toFixed(3),
      low: +low.toFixed(3),
      close: +close.toFixed(3),
      volume,
    })
  }

  if (bars.length < 16) {
    return { ok: false, error: `Too few valid bars (${bars.length}). Check date/time and OHLC columns.` }
  }

  const timeframe = inferTimeframeFromBars(bars)
  return { ok: true, bars, timeframe, barCount: bars.length }
}
