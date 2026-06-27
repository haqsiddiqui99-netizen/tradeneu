# Roll back TradingView CSS design system (see src/styles/ROLLBACK.md)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host 'Removing src/styles/...' -ForegroundColor Yellow
if (Test-Path 'src/styles') {
  Remove-Item -Recurse -Force 'src/styles'
}

$files = @(
  'src/views/workspace.css',
  'src/views/chartIntervalMenu.css',
  'src/views/chartTypeMenu.css',
  'src/views/replayGoToMenu.css',
  'src/views/chartIntervalMenu.ts',
  'src/views/chartTypeMenu.ts',
  'src/views/replayGoToMenu.ts'
)

Write-Host 'Restoring modified files from git (if tracked)...' -ForegroundColor Yellow
foreach ($f in $files) {
  git checkout HEAD -- $f 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  Could not restore $f — restore manually or revert commit." -ForegroundColor DarkYellow
  }
}

Remove-Item -Force 'scripts/rollback-tv-design-system.ps1' -ErrorAction SilentlyContinue
Write-Host 'Done. Reload the app to verify.' -ForegroundColor Green
