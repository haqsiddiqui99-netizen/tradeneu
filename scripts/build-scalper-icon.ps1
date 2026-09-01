# Builds the Scalper mode rocket icon from the supplied line-art PNG.
# The source is 24bpp with the transparency checkerboard baked into its pixels, so the
# alpha channel is derived from ink darkness: dark strokes stay opaque, light cells drop
# out, and antialiased edges keep partial alpha. Output is a square mask consumed via
# CSS mask-image so the icon inherits currentColor in both chart themes.
Add-Type -AssemblyName System.Drawing

$src = 'C:\Users\qamrulhs\.cursor\projects\c-Users-qamrulhs-Suplexity\assets\c__Users_qamrulhs_AppData_Roaming_Cursor_User_workspaceStorage_e9043972cf08d6b0194d6945ecb53c0c_images_Rocket-icon_ScalperMode-47db58ce-d86e-4f3d-bd2d-83fb68624d7f.png'
$target = Join-Path (Get-Location) 'public\icons\scalper-rocket.png'
$size = 128
$inkCutoff = 225.0
# Bounds ignore faint pixels: checkerboard cell seams sit just under the ink cutoff and
# would otherwise stretch the trim box to the full canvas, shrinking the rendered glyph.
$boundsCutoff = 160.0

$bmp = [System.Drawing.Bitmap]::FromFile($src)
$w = $bmp.Width
$h = $bmp.Height
Write-Output "source: ${w}x${h} $($bmp.PixelFormat)"

# Ink coverage per pixel, plus the bounding box of everything that survives.
$alpha = New-Object 'byte[,]' $w, $h
$minX = $w; $minY = $h; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $c = $bmp.GetPixel($x, $y)
    $lum = 0.299 * $c.R + 0.587 * $c.G + 0.114 * $c.B
    if ($lum -ge $inkCutoff) { continue }
    $a = [int][Math]::Round((($inkCutoff - $lum) / $inkCutoff) * 255)
    if ($a -le 8) { continue }
    $alpha[$x, $y] = [byte][Math]::Min(255, $a)
    if ($lum -ge $boundsCutoff) { continue }
    if ($x -lt $minX) { $minX = $x }
    if ($y -lt $minY) { $minY = $y }
    if ($x -gt $maxX) { $maxX = $x }
    if ($y -gt $maxY) { $maxY = $y }
  }
}
$bmp.Dispose()

if ($maxX -lt 0) { throw 'No ink found in source image.' }
$inkW = $maxX - $minX + 1
$inkH = $maxY - $minY + 1
Write-Output "ink bounds: ${inkW}x${inkH} at (${minX},${minY})"

# Trimmed ink on a transparent square canvas, aspect preserved.
$side = [Math]::Max($inkW, $inkH)
$offsetX = [int][Math]::Round(($side - $inkW) / 2)
$offsetY = [int][Math]::Round(($side - $inkH) / 2)
$square = New-Object System.Drawing.Bitmap $side, $side, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $inkH; $y++) {
  for ($x = 0; $x -lt $inkW; $x++) {
    $a = $alpha[($minX + $x), ($minY + $y)]
    if ($a -eq 0) { continue }
    $square.SetPixel($offsetX + $x, $offsetY + $y, [System.Drawing.Color]::FromArgb($a, 0, 0, 0))
  }
}

$dst = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($square, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
$g.Dispose()
$square.Dispose()

$dst.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()
Write-Output "wrote public/icons/scalper-rocket.png (${size}x${size})"
