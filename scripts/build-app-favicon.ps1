# Builds the browser/app icons from the TN logo artwork.
# The source PNG has the transparency checkerboard baked into its pixels (24bpp, no
# alpha channel). The artwork is a rounded square, so every checkerboard pixel is
# reachable by scanning inward from an edge — that yields an exact alpha mask without
# having to guess the corner radius.
Add-Type -AssemblyName System.Drawing

$src = 'C:\Users\qamrulhs\.cursor\projects\c-Users-qamrulhs-Suplexity\assets\c__Users_qamrulhs_AppData_Roaming_Cursor_User_workspaceStorage_e9043972cf08d6b0194d6945ecb53c0c_images_TN_Logo-a3d3bda0-8a5e-40ff-b7b7-3e4b84ebf659.png'
$outDir = Join-Path (Get-Location) 'public'

$srcBmp = [System.Drawing.Bitmap]::FromFile($src)
$w = $srcBmp.Width
$h = $srcBmp.Height
Write-Output "source: ${w}x${h} $($srcBmp.PixelFormat)"

$work = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g0 = [System.Drawing.Graphics]::FromImage($work)
$g0.DrawImage($srcBmp, 0, 0, $w, $h)
$g0.Dispose()
$srcBmp.Dispose()

$clear = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)

# Checkerboard cells are pure white or mid grey; artwork is saturated, dark, or #ececec.
function Test-Checker([System.Drawing.Bitmap]$b, [int]$x, [int]$y) {
  $c = $b.GetPixel($x, $y)
  if ($c.A -eq 0) { return $true }
  $mx = [Math]::Max($c.R, [Math]::Max($c.G, $c.B))
  $mn = [Math]::Min($c.R, [Math]::Min($c.G, $c.B))
  if (($mx - $mn) -gt 14) { return $false }
  return $mn -ge 188
}

# Flood fill inward from the border. A straight edge scan stops at the first stray
# pixel (antialiased cell seams, the artwork watermark) and strands checker cells
# behind it; the fill routes around them while the saturated rainbow rim blocks it
# from ever reaching the artwork.
$cleared = 0
$seen = New-Object 'System.Collections.Generic.HashSet[int]'
$stack = New-Object 'System.Collections.Generic.Stack[int]'

function Add-Seed([int]$x, [int]$y) {
  $key = $y * $script:w + $x
  if ($script:seen.Add($key)) { $script:stack.Push($key) }
}

for ($x = 0; $x -lt $w; $x++) { Add-Seed $x 0; Add-Seed $x ($h - 1) }
for ($y = 0; $y -lt $h; $y++) { Add-Seed 0 $y; Add-Seed ($w - 1) $y }

while ($stack.Count -gt 0) {
  $key = $stack.Pop()
  $x = $key % $w
  $y = [int](($key - $x) / $w)
  if (-not (Test-Checker $work $x $y)) { continue }
  $work.SetPixel($x, $y, $clear)
  $cleared++
  if ($x -gt 0) { Add-Seed ($x - 1) $y }
  if ($x -lt $w - 1) { Add-Seed ($x + 1) $y }
  if ($y -gt 0) { Add-Seed $x ($y - 1) }
  if ($y -lt $h - 1) { Add-Seed $x ($y + 1) }
}
Write-Output ("masked {0} edge pixels ({1:P1} of canvas)" -f $cleared, ($cleared / ($w * $h)))

function Save-Icon([int]$size, [string]$name) {
  $dst = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($work, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
  $g.Dispose()

  $target = Join-Path $outDir $name
  $dst.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose()
  Write-Output "wrote public/$name (${size}x${size})"
}

Save-Icon 512 'favicon.png'
Save-Icon 32 'favicon-32.png'
Save-Icon 180 'apple-touch-icon.png'

$work.Dispose()
