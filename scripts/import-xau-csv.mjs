/**
 * Converts XAU/USD (or GC) minute CSV into public/data/xauusd-bars.json for the browser.
 *
 * Usage:
 *   node scripts/import-xau-csv.mjs path/to/XAUUSD_Minute.csv
 *   node scripts/import-xau-csv.mjs data.csv --out public/data/xauusd-bars.json --max 50000
 *
 * Supports common headers (case-insensitive): Time|Datetime|Timestamp, Open, High, Low, Close, Volume|Tickvol|Tick volume
 * Or MT5-style: <DATE> <TIME> with tab delimiter.
 */

import fs from 'fs'
import path from 'path'
import { parseXauCsvText } from './xauCsvParse.mjs'

function parseArgs(argv) {
  const out = { inPath: '', outPath: 'public/data/xauusd-bars.json', max: 250_000, delimiter: '' }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') out.outPath = argv[++i] ?? out.outPath
    else if (a === '--max') out.max = Math.max(1, Number(argv[++i]) || out.max)
    else if (a === '--delimiter') out.delimiter = argv[++i] ?? ''
    else if (!a.startsWith('-') && !out.inPath) out.inPath = a
  }
  if (!out.inPath) {
    console.error('Usage: node scripts/import-xau-csv.mjs <file.csv> [--out path] [--max N] [--delimiter ,|\\t]')
    process.exit(1)
  }
  return out
}

function main() {
  const opts = parseArgs(process.argv)
  const raw = fs.readFileSync(opts.inPath, 'utf8')
  const parsed = parseXauCsvText(raw, {
    maxBars: opts.max,
    delimiter: opts.delimiter || undefined,
  })
  if (!parsed.ok) {
    console.error(parsed.error)
    process.exit(1)
  }

  const outDir = path.dirname(opts.outPath)
  fs.mkdirSync(outDir, { recursive: true })
  const payload = {
    symbol: 'XAUUSD',
    timeframe: parsed.timeframe,
    source: `imported:${path.basename(opts.inPath)}`,
    bars: parsed.bars,
  }
  fs.writeFileSync(opts.outPath, JSON.stringify(payload))
  console.log(`Wrote ${parsed.bars.length} bars to ${opts.outPath} (timeframe ${parsed.timeframe})`)
}

main()
