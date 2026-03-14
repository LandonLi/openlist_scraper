$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot 'public\app-icon.png'
$buildDir = Join-Path $projectRoot 'build'
$pngOut = Join-Path $buildDir 'icon.png'
$icoOut = Join-Path $buildDir 'icon.ico'

if (-not (Test-Path $sourcePath)) {
  throw "Source icon not found: $sourcePath"
}

Add-Type -AssemblyName System.Drawing

function New-ResizedBitmap {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.DrawImage($Image, 0, 0, $Size, $Size)
  $graphics.Dispose()
  return $bitmap
}

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)

try {
  $pngBitmap = New-ResizedBitmap -Image $sourceImage -Size 512
  try {
    $pngBitmap.Save($pngOut, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $pngBitmap.Dispose()
  }

  $sizes = @(256, 128, 64, 48, 32, 16)
  $streams = New-Object System.Collections.Generic.List[System.IO.MemoryStream]

  foreach ($size in $sizes) {
    $bitmap = New-ResizedBitmap -Image $sourceImage -Size $size
    try {
      $stream = New-Object System.IO.MemoryStream
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      $stream.Position = 0
      [void]$streams.Add($stream)
    } finally {
      $bitmap.Dispose()
    }
  }

  try {
    $fileStream = [System.IO.File]::Create($icoOut)
    $writer = New-Object System.IO.BinaryWriter($fileStream)
    try {
      $writer.Write([UInt16]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]$streams.Count)

      $offset = 6 + (16 * $streams.Count)

      foreach ($index in 0..($streams.Count - 1)) {
        $size = $sizes[$index]
        $stream = $streams[$index]
        $dimensionByte = if ($size -ge 256) { 0 } else { [byte]$size }

        $writer.Write([byte]$dimensionByte)
        $writer.Write([byte]$dimensionByte)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$stream.Length)
        $writer.Write([UInt32]$offset)

        $offset += [int]$stream.Length
      }

      foreach ($stream in $streams) {
        $writer.Write($stream.ToArray())
      }
    } finally {
      $writer.Dispose()
      $fileStream.Dispose()
    }
  } finally {
    foreach ($stream in $streams) {
      $stream.Dispose()
    }
  }
} finally {
  $sourceImage.Dispose()
}

Write-Output "Generated $pngOut"
Write-Output "Generated $icoOut"
