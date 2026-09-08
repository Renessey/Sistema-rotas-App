Add-Type -AssemblyName System.Drawing

function BuildRotimizeEmblem(
    [int]$canvasSize,
    [float]$contentScale,
    [bool]$transparentBg,
    [bool]$clipCircleRound,
    [bool]$includeText
) {
    $bmp = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)

    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Optional round clipping for Android ic_launcher_round
    if ($clipCircleRound) {
        $clipPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $clipPath.AddEllipse(0, 0, $canvasSize, $canvasSize)
        $g.SetClip($clipPath)
        $clipPath.Dispose()
    }

    # Background
    if (-not $transparentBg) {
        $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#1800AD"))
        $g.FillRectangle($bgBrush, 0, 0, $canvasSize, $canvasSize)
        $bgBrush.Dispose()
    }

    $cx = $canvasSize / 2.0
    $cy = $canvasSize / 2.0

    # Base scale relative to 1024 standard canvas
    $baseScale = ($canvasSize / 1024.0) * $contentScale

    # Pin proportions
    if ($includeText) {
        $headCy = $cy - (62.0 * $baseScale)
        $headR  = 145.0 * $baseScale
        $tipY   = $cy + (210.0 * $baseScale)
        $holeR  = 65.0 * $baseScale
    } else {
        # Pin centered directly in the canvas if no text
        $headCy = $cy - (80.0 * $baseScale)
        $headR  = 190.0 * $baseScale
        $tipY   = $cy + (270.0 * $baseScale)
        $holeR  = 85.0 * $baseScale
    }

    $getPin = {
        param([float]$offsetY)
        $p = New-Object System.Drawing.Drawing2D.GraphicsPath
        $y = $offsetY * $baseScale

        # Left arc & tip
        $p.AddBezier(
            [float]$cx, [float]($headCy - $headR + $y),
            [float]($cx - $headR * 0.78), [float]($headCy - $headR + $y),
            [float]($cx - $headR), [float]($headCy - $headR * 0.35 + $y),
            [float]($cx - $headR), [float]($headCy + $y)
        )
        $p.AddBezier(
            [float]($cx - $headR), [float]($headCy + $y),
            [float]($cx - $headR), [float]($headCy + $headR * 0.95 + $y),
            [float]($cx - 20.0 * $baseScale), [float]($tipY - 30.0 * $baseScale + $y),
            [float]$cx, [float]($tipY + $y)
        )
        # Right arc & tip
        $p.AddBezier(
            [float]$cx, [float]($tipY + $y),
            [float]($cx + 20.0 * $baseScale), [float]($tipY - 30.0 * $baseScale + $y),
            [float]($cx + $headR), [float]($headCy + $headR * 0.95 + $y),
            [float]($cx + $headR), [float]($headCy + $y)
        )
        $p.AddBezier(
            [float]($cx + $headR), [float]($headCy + $y),
            [float]($cx + $headR), [float]($headCy - $headR * 0.35 + $y),
            [float]($cx + $headR * 0.78), [float]($headCy - $headR + $y),
            [float]$cx, [float]($headCy - $headR + $y)
        )
        $p.CloseFigure()

        # Inner hole
        $p.AddEllipse([float]($cx - $holeR), [float]($headCy - $holeR + $y), [float](2.0 * $holeR), [float](2.0 * $holeR))
        return $p
    }

    # Soft subtle pin shadow
    $shadowPath = & $getPin 6.0
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 0, 0, 40))
    $g.FillPath($shadowBrush, $shadowPath)
    $shadowBrush.Dispose()
    $shadowPath.Dispose()

    # Crisp White Pin
    $pinPath = & $getPin 0.0
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPath($whiteBrush, $pinPath)
    $whiteBrush.Dispose()
    $pinPath.Dispose()

    # Typography "Rotimize"
    if ($includeText) {
        $fontSize = [float](82.0 * $baseScale)
        if ($fontSize -gt 6.0) {
            $font = New-Object System.Drawing.Font("Bahnschrift", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

            $sf = New-Object System.Drawing.StringFormat
            $sf.Alignment = [System.Drawing.StringAlignment]::Center
            $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

            $textY = $cy + (265.0 * $baseScale)
            $textH = 95.0 * $baseScale

            # Soft text shadow
            $textShadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(45, 0, 0, 45))
            $textShadowRect = New-Object System.Drawing.RectangleF(0, [float]($textY + 3.0 * $baseScale), [float]$canvasSize, [float]$textH)
            $g.DrawString("Rotimize", $font, $textShadowBrush, $textShadowRect, $sf)
            $textShadowBrush.Dispose()

            # Crisp White text
            $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
            $textRect = New-Object System.Drawing.RectangleF(0, [float]$textY, [float]$canvasSize, [float]$textH)
            $g.DrawString("Rotimize", $font, $textBrush, $textRect, $sf)
            $textBrush.Dispose()
            $font.Dispose()
        }
    }

    $g.Dispose()
    return $bmp
}

# ----------------------------------------------------
# 1. Generate src/assets/logo.png (1024x1024, Full HD with brand blue #1800AD background, NO CIRCLE)
# ----------------------------------------------------
Write-Output "Generating clean src/assets/logo.png..."
$logo = BuildRotimizeEmblem 1024 1.0 $false $false $true
$logo.Save("c:\Projetos\Routes\src\assets\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$logo.Dispose()

# ----------------------------------------------------
# 2. Generate Android Splash Logo (1024x1024, transparent background, safe 0.70 scale for Android 12+ circular viewport, NO CIRCLE)
# ----------------------------------------------------
Write-Output "Generating clean splash_logo.png for Android drawables..."
$drawableDir = "c:\Projetos\Routes\android\app\src\main\res\drawable"
$drawableNodpiDir = "c:\Projetos\Routes\android\app\src\main\res\drawable-nodpi"
if (-not (Test-Path $drawableNodpiDir)) {
    New-Item -ItemType Directory -Path $drawableNodpiDir -Force | Out-Null
}

$splashLogo = BuildRotimizeEmblem 1024 0.70 $true $false $true
$splashLogo.Save("$drawableDir\splash_logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$splashLogo.Save("$drawableNodpiDir\splash_logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$splashLogo.Dispose()

# ----------------------------------------------------
# 3. Generate Android Launcher Icons (mdpi to xxxhdpi)
# ----------------------------------------------------
$densities = @{
    "mdpi"    = 48
    "hdpi"    = 72
    "xhdpi"   = 96
    "xxhdpi"  = 144
    "xxxhdpi" = 192
}

foreach ($entry in $densities.GetEnumerator()) {
    $folder = "c:\Projetos\Routes\android\app\src\main\res\mipmap-$($entry.Key)"
    $px = $entry.Value
    Write-Output "Generating clean launcher icons for $folder ($px x $px)..."

    # Square icon (solid #1800AD, pin + text, NO inner circle badge)
    $squareIcon = BuildRotimizeEmblem $px 0.88 $false $false $true
    $squareIcon.Save("$folder\ic_launcher.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $squareIcon.Dispose()

    # Round icon (clipped to circle, solid #1800AD, pin + text, NO inner circle badge)
    $roundIcon = BuildRotimizeEmblem $px 0.95 $false $true $true
    $roundIcon.Save("$folder\ic_launcher_round.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $roundIcon.Dispose()
}

Write-Output "ALL CLEAN ASSETS (WITHOUT CIRCLE) GENERATED SUCCESSFULLY!"
