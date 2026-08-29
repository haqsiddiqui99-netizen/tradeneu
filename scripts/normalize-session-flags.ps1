# Session flag assets ship with a checkerboard baked into the pixels (no alpha
# channel), so the disc is cropped from measured bounds and masked to a circle.
# Output: uniform square PNGs with transparent corners for the TV header strip.
Add-Type -AssemblyName System.Drawing

$assets = 'C:\Users\qamrulhs\.cursor\projects\c-Users-qamrulhs-Suplexity\assets'
$out = Join-Path (Get-Location) 'public\icons'
$size = 96
$inset = 0.985

$sources = [ordered]@{
  sydney  = @{ file = 'c__Users_qamrulhs_AppData_Roaming_Cursor_User_workspaceStorage_e9043972cf08d6b0194d6945ecb53c0c_images_Sydney_flag_WB-85e9f93e-b277-4174-8e9b-2a30405f4aa0.png'; box = @(85, 150, 790, 905) }
  tokyo   = @{ file = 'c__Users_qamrulhs_AppData_Roaming_Cursor_User_workspaceStorage_e9043972cf08d6b0194d6945ecb53c0c_images_Tokyo_flag_WB-29149c00-b571-428e-8e27-c8c34620f9eb.png'; box = @(85, 170, 785, 890) }
  london  = @{ file = 'c__Users_qamrulhs_AppData_Roaming_Cursor_User_workspaceStorage_e9043972cf08d6b0194d6945ecb53c0c_images_London_flag_WB-8ed6ffd1-e0cf-4580-8bd5-413b46d62518.png'; box = @(90, 170, 780, 900) }
  newyork = @{ file = 'c__Users_qamrulhs_AppData_Roaming_Cursor_User_workspaceStorage_e9043972cf08d6b0194d6945ecb53c0c_images_NewYork_flag_WB-691b9bf1-7bc3-454f-b4f0-296a08522f71.png'; box = @(15, 55, 865, 980) }
}

foreach ($name in $sources.Keys) {
  $spec = $sources[$name]
  $src = Join-Path $assets $spec.file
  if (-not (Test-Path $src)) { Write-Output "$name -> MISSING SOURCE"; continue }

  try { $bmp = [System.Drawing.Bitmap]::FromFile($src) }
  catch { Write-Output "$name -> LOAD FAILED: $($_.Exception.Message)"; continue }

  $l, $t, $r, $b = $spec.box
  $side = [Math]::Min([Math]::Max($r - $l, $b - $t) * $inset, [Math]::Min($bmp.Width, $bmp.Height))
  $sx = [int][Math]::Round((($l + $r) / 2) - ($side / 2))
  $sy = [int][Math]::Round((($t + $b) / 2) - ($side / 2))
  $side = [int][Math]::Round($side)
  $sx = [Math]::Max(0, [Math]::Min($sx, $bmp.Width - $side))
  $sy = [Math]::Max(0, [Math]::Min($sy, $bmp.Height - $side))

  $dst = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(0, 0, $size, $size)
  $g.SetClip($path)
  $g.DrawImage(
    $bmp,
    (New-Object System.Drawing.Rectangle 0, 0, $size, $size),
    $sx, $sy, $side, $side,
    [System.Drawing.GraphicsUnit]::Pixel
  )
  $path.Dispose()
  $g.Dispose()

  $target = Join-Path $out "session-$name.png"
  $dst.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose()
  $bmp.Dispose()

  Write-Output "$name crop=${side}@(${sx},${sy}) -> ${size}x${size}"
}
