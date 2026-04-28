[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$publicDir = Join-Path $root "public"
$installerWindowsDir = Join-Path $root "installer\windows"
$installerLinuxDir = Join-Path $root "installer\linux"

function New-RoundedRectanglePath([System.Drawing.RectangleF]$Rect, [single]$Radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = [Math]::Min($Radius * 2, [Math]::Min($Rect.Width, $Rect.Height))

  if ($diameter -le 0) {
    $path.AddRectangle($Rect)
    return $path
  }

  $arc = [System.Drawing.RectangleF]::new($Rect.X, $Rect.Y, $diameter, $diameter)
  $path.AddArc($arc, 180, 90)
  $arc.X = $Rect.Right - $diameter
  $path.AddArc($arc, 270, 90)
  $arc.Y = $Rect.Bottom - $diameter
  $path.AddArc($arc, 0, 90)
  $arc.X = $Rect.X
  $path.AddArc($arc, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-BrandBitmap([int]$Size) {
  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::FromArgb(0, 7, 15, 28))

  $backgroundRect = [System.Drawing.RectangleF]::new($Size * 0.08, $Size * 0.08, $Size * 0.84, $Size * 0.84)
  $backgroundShadowRect = [System.Drawing.RectangleF]::new($backgroundRect.X, $backgroundRect.Y + ($Size * 0.03), $backgroundRect.Width, $backgroundRect.Height)
  $ringOuter = [System.Drawing.RectangleF]::new($Size * 0.18, $Size * 0.16, $Size * 0.48, $Size * 0.48)
  $ringInner = [System.Drawing.RectangleF]::new($Size * 0.29, $Size * 0.27, $Size * 0.26, $Size * 0.26)
  $ringGlowRect = [System.Drawing.RectangleF]::new($Size * 0.13, $Size * 0.10, $Size * 0.60, $Size * 0.60)

  $backgroundShadowPath = New-RoundedRectanglePath $backgroundShadowRect ($Size * 0.16)
  $backgroundPath = New-RoundedRectanglePath $backgroundRect ($Size * 0.16)

  $backgroundShadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(82, 3, 8, 18))
  $graphics.FillPath($backgroundShadowBrush, $backgroundShadowPath)
  $backgroundShadowBrush.Dispose()
  $backgroundShadowPath.Dispose()

  $backgroundBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $backgroundRect,
    [System.Drawing.Color]::FromArgb(255, 10, 24, 52),
    [System.Drawing.Color]::FromArgb(255, 22, 77, 126),
    52
  )
  $graphics.FillPath($backgroundBrush, $backgroundPath)
  $backgroundBrush.Dispose()

  $panelGlowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($backgroundPath)
  $panelGlowBrush.CenterColor = [System.Drawing.Color]::FromArgb(108, 78, 209, 255)
  $panelGlowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 78, 209, 255))
  $graphics.FillPath($panelGlowBrush, $backgroundPath)
  $panelGlowBrush.Dispose()

  $panelGlossRect = [System.Drawing.RectangleF]::new($backgroundRect.X + ($Size * 0.03), $backgroundRect.Y + ($Size * 0.02), $backgroundRect.Width * 0.78, $backgroundRect.Height * 0.42)
  $panelGlossBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $panelGlossRect,
    [System.Drawing.Color]::FromArgb(110, 242, 250, 255),
    [System.Drawing.Color]::FromArgb(0, 242, 250, 255),
    90
  )
  $graphics.FillEllipse($panelGlossBrush, $panelGlossRect)
  $panelGlossBrush.Dispose()

  $panelBorderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(118, 166, 228, 255), [Math]::Max(4, $Size * 0.012))
  $graphics.DrawPath($panelBorderPen, $backgroundPath)
  $panelBorderPen.Dispose()
  $backgroundPath.Dispose()

  $ringGlowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush((New-RoundedRectanglePath $ringGlowRect ($Size * 0.24)))
  $ringGlowBrush.CenterColor = [System.Drawing.Color]::FromArgb(94, 70, 229, 255)
  $ringGlowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 70, 229, 255))
  $graphics.FillEllipse($ringGlowBrush, $ringGlowRect)
  $ringGlowBrush.Dispose()

  $ringShadowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(84, 4, 14, 30), [Math]::Max(10, $Size * 0.08))
  $graphics.DrawEllipse($ringShadowPen, $ringOuter.X + ($Size * 0.014), $ringOuter.Y + ($Size * 0.02), $ringOuter.Width, $ringOuter.Height)
  $ringShadowPen.Dispose()

  $ringBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $ringOuter,
    [System.Drawing.Color]::FromArgb(255, 123, 241, 255),
    [System.Drawing.Color]::FromArgb(255, 37, 116, 230),
    42
  )
  $ringPen = New-Object System.Drawing.Pen($ringBrush, [Math]::Max(10, $Size * 0.08))
  $graphics.DrawEllipse($ringPen, $ringOuter)
  $ringPen.Dispose()
  $ringBrush.Dispose()

  $innerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 8, 16, 33))
  $graphics.FillEllipse($innerBrush, $ringInner)
  $innerBrush.Dispose()

  $ringHighlightPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(148, 241, 251, 255), [Math]::Max(4, $Size * 0.018))
  $graphics.DrawArc($ringHighlightPen, $ringOuter, 205, 92)
  $ringHighlightPen.Dispose()

  $ringEdgePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(140, 11, 34, 88), [Math]::Max(3, $Size * 0.012))
  $graphics.DrawEllipse($ringEdgePen, $ringOuter)
  $ringEdgePen.Dispose()

  $letterShadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(94, 3, 12, 28))
  $graphics.FillRectangle($letterShadowBrush, $Size * 0.56, $Size * 0.25, $Size * 0.12, $Size * 0.31)
  $graphics.FillRectangle($letterShadowBrush, $Size * 0.56, $Size * 0.45, $Size * 0.21, $Size * 0.11)
  $letterShadowBrush.Dispose()

  $letterRect = [System.Drawing.RectangleF]::new($Size * 0.53, $Size * 0.21, $Size * 0.25, $Size * 0.39)
  $letterBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $letterRect,
    [System.Drawing.Color]::FromArgb(255, 242, 249, 255),
    [System.Drawing.Color]::FromArgb(255, 126, 220, 255),
    92
  )
  $graphics.FillRectangle($letterBrush, $Size * 0.54, $Size * 0.22, $Size * 0.098, $Size * 0.31)
  $graphics.FillRectangle($letterBrush, $Size * 0.54, $Size * 0.43, $Size * 0.19, $Size * 0.098)
  $letterBrush.Dispose()

  $letterHighlightBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(118, 255, 255, 255))
  $graphics.FillRectangle($letterHighlightBrush, $Size * 0.54, $Size * 0.22, $Size * 0.022, $Size * 0.31)
  $graphics.FillRectangle($letterHighlightBrush, $Size * 0.54, $Size * 0.43, $Size * 0.19, $Size * 0.022)
  $letterHighlightBrush.Dispose()

  $letterEdgeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(116, 7, 24, 60))
  $graphics.FillRectangle($letterEdgeBrush, $Size * 0.618, $Size * 0.22, $Size * 0.02, $Size * 0.31)
  $graphics.FillRectangle($letterEdgeBrush, $Size * 0.54, $Size * 0.508, $Size * 0.19, $Size * 0.02)
  $letterEdgeBrush.Dispose()

  $signalBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 122, 243, 255))
  $graphics.FillEllipse($signalBrush, $Size * 0.71, $Size * 0.23, $Size * 0.055, $Size * 0.055)
  $signalBrush.Dispose()

  $graphics.Dispose()
  return $bitmap
}

function Save-Png([System.Drawing.Bitmap]$Bitmap, [string]$Path) {
  $directory = Split-Path -Parent $Path
  if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Save-Ico([System.Drawing.Bitmap]$Bitmap, [string]$Path) {
  $directory = Split-Path -Parent $Path
  if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $icon = [System.Drawing.Icon]::FromHandle($Bitmap.GetHicon())
  try {
    $fileStream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create)
    try {
      $icon.Save($fileStream)
    } finally {
      $fileStream.Dispose()
    }
  } finally {
    $icon.Dispose()
  }
}

$icon512 = New-BrandBitmap 512
$icon192 = New-BrandBitmap 192
$icon256 = New-BrandBitmap 256
$linuxIcon = New-BrandBitmap 512

try {
  Save-Png $icon512 (Join-Path $publicDir "icon-512.png")
  Save-Png $icon192 (Join-Path $publicDir "icon-192.png")
  Save-Png $icon256 (Join-Path $publicDir "apple-touch-icon.png")
  Save-Ico $icon256 (Join-Path $publicDir "favicon.ico")
  Save-Ico $icon256 (Join-Path $installerWindowsDir "oload.ico")
  Save-Png $linuxIcon (Join-Path $installerLinuxDir "oload.png")
} finally {
  $icon512.Dispose()
  $icon192.Dispose()
  $icon256.Dispose()
  $linuxIcon.Dispose()
}

Write-Host "Brand icons written to public/, installer/windows/, and installer/linux/."