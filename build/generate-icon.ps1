param(
    [string]$Source = "build/icon.png",
    [string]$Output = "build/icon.ico"
)

Add-Type -AssemblyName System.Drawing

function New-SizeBitmap {
    param(
        [System.Drawing.Image]$SourceImage,
        [int]$Size
    )

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bitmap.SetResolution(96, 96)

    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $scale = [Math]::Min($Size / $SourceImage.Width, $Size / $SourceImage.Height)
        $drawW = [Math]::Round($SourceImage.Width * $scale)
        $drawH = [Math]::Round($SourceImage.Height * $scale)
        $drawX = [Math]::Round(($Size - $drawW) / 2)
        $drawY = [Math]::Round(($Size - $drawH) / 2)
        $graphics.DrawImage($SourceImage, $drawX, $drawY, $drawW, $drawH)
    }
    finally {
        $graphics.Dispose()
    }

    return $bitmap
}

function Invoke-Sharpen {
    param(
        [System.Drawing.Bitmap]$Bitmap,
        [double]$Amount
    )

    if ($Amount -le 0) {
        return $Bitmap
    }

    $width = $Bitmap.Width
    $height = $Bitmap.Height
    $out = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $out.SetResolution(96, 96)

    $center = 1 + (4 * $Amount)
    $side = -1 * $Amount

    for ($y = 0; $y -lt $height; $y += 1) {
        for ($x = 0; $x -lt $width; $x += 1) {
            $c = $Bitmap.GetPixel($x, $y)
            $left = $Bitmap.GetPixel([Math]::Max(0, $x - 1), $y)
            $right = $Bitmap.GetPixel([Math]::Min($width - 1, $x + 1), $y)
            $up = $Bitmap.GetPixel($x, [Math]::Max(0, $y - 1))
            $down = $Bitmap.GetPixel($x, [Math]::Min($height - 1, $y + 1))

            $a = [Math]::Max(0, [Math]::Min(255, [int][Math]::Round(($center * $c.A) + ($side * ($left.A + $right.A + $up.A + $down.A)))))
            $r = [Math]::Max(0, [Math]::Min(255, [int][Math]::Round(($center * $c.R) + ($side * ($left.R + $right.R + $up.R + $down.R)))))
            $g = [Math]::Max(0, [Math]::Min(255, [int][Math]::Round(($center * $c.G) + ($side * ($left.G + $right.G + $up.G + $down.G)))))
            $b = [Math]::Max(0, [Math]::Min(255, [int][Math]::Round(($center * $c.B) + ($side * ($left.B + $right.B + $up.B + $down.B)))))

            $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, $r, $g, $b))
        }
    }

    $Bitmap.Dispose()
    return $out
}

function Convert-ToPngBytes {
    param([System.Drawing.Bitmap]$Bitmap)

    $stream = New-Object System.IO.MemoryStream
    try {
        $Bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        return $stream.ToArray()
    }
    finally {
        $stream.Dispose()
    }
}

function Write-UInt16 {
    param([System.IO.BinaryWriter]$Writer, [int]$Value)
    $Writer.Write([UInt16]$Value)
}

function Write-UInt32 {
    param([System.IO.BinaryWriter]$Writer, [long]$Value)
    $Writer.Write([UInt32]$Value)
}

$sourcePath = Resolve-Path $Source
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)

try {
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $entries = @()

    foreach ($size in $sizes) {
        $bitmap = New-SizeBitmap -SourceImage $sourceImage -Size $size
        $pngBytes = Convert-ToPngBytes -Bitmap $bitmap
        $bitmap.Dispose()
        $entries += [pscustomobject]@{ Size = $size; Bytes = $pngBytes }
    }

    $outputPath = Join-Path (Get-Location) $Output
    $file = [System.IO.File]::Create($outputPath)
    $writer = New-Object System.IO.BinaryWriter($file)

    try {
        Write-UInt16 $writer 0
        Write-UInt16 $writer 1
        Write-UInt16 $writer $entries.Count

        $offset = 6 + (16 * $entries.Count)
        foreach ($entry in $entries) {
            $sizeByte = if ($entry.Size -eq 256) { 0 } else { $entry.Size }
            $writer.Write([byte]$sizeByte)
            $writer.Write([byte]$sizeByte)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            Write-UInt16 $writer 1
            Write-UInt16 $writer 32
            Write-UInt32 $writer $entry.Bytes.Length
            Write-UInt32 $writer $offset
            $offset += $entry.Bytes.Length
        }

        foreach ($entry in $entries) {
            $writer.Write([byte[]]$entry.Bytes)
        }
    }
    finally {
        $writer.Dispose()
        $file.Dispose()
    }
}
finally {
    $sourceImage.Dispose()
}
