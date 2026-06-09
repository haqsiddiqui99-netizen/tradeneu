/**
 * Cross-platform ML venv helper (from repo root).
 * Usage: node scripts/mlRunner.mjs venv | install | api | train
 */
import { existsSync } from 'fs'
import { spawn, spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mlDir = path.join(__dirname, '..', 'ml-service')

function venvPython() {
  return process.platform === 'win32'
    ? path.join(mlDir, '.venv', 'Scripts', 'python.exe')
    : path.join(mlDir, '.venv', 'bin', 'python3')
}

const py = venvPython()

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: mlDir, stdio: 'inherit', ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const step = process.argv[2]

if (step === 'venv') {
  if (existsSync(py)) {
    console.log('.venv already exists:', py)
    process.exit(0)
  }
  run('python', ['-m', 'venv', '.venv'])
  console.log('Created', py)
  process.exit(0)
} else if (step === 'install') {
  if (!existsSync(py)) {
    console.error('Run first: node scripts/mlRunner.mjs venv')
    process.exit(1)
  }
  run(py, ['-m', 'pip', 'install', '--upgrade', 'pip'])
  run(py, ['-m', 'pip', 'install', '-r', 'requirements.txt'])
  process.exit(0)
} else if (step === 'api') {
  if (!existsSync(py)) {
    console.error('Run first: node scripts/mlRunner.mjs venv && node scripts/mlRunner.mjs install')
    process.exit(1)
  }
  spawn(py, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001', '--reload'], {
    cwd: mlDir,
    stdio: 'inherit',
  }).on('exit', (c) => process.exit(c ?? 0))
} else if (step === 'train') {
  if (!existsSync(py)) {
    console.error('Missing .venv')
    process.exit(1)
  }
  run(py, ['scripts/train_example.py'])
  process.exit(0)
} else {
  console.log('Usage: node scripts/mlRunner.mjs venv | install | api | train')
  process.exit(step ? 1 : 0)
}
