Add-Type -AssemblyName System.Drawing

# Helper to build the high quality Rotimize emblem
function GenerateRotimizeBitmap([int]$canvasSize, [float]$badgeRatio, [bool]$transparentBg, [bool]$clipCircle) {
    $bmp = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)

    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $scale = $canvasSize / 1024.0

    if ($clipCircle) {
        $clipPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $clipPath.AddEllipse(0, 0, $canvasSize, $canvasSize)
        $g.SetClip($clipPath)
    }

    if (-not $transparentBg) {
        $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#1800AD"))
        $g.FillRectangle($bgBrush, 0, 0, $canvasSize, $canvasSize)
        $bgBrush.Dispose()

        # Ambient glow ring
        $ringD = [float](740.0 * $scale)
        $ringOffset = ($canvasSize - $ringD) / 2.0
        $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(25, 255, 255, 255), [float](3.0 * $scale))
        $g.DrawEllipse($ringPen, [float]$ringOffset, [float]$ringOffset, [float]$ringD, [float]$ringD)
        $ringPen.Dispose()
    }

    # Center (cx, cy)
    $cx = $canvasSize / 2.0
    $cy = $canvasSize / 2.0

    # Badge circle diameter
    $badgeD = ($canvasSize * $badgeRatio)
    $badgeR = $badgeD / 2.0
    $badgeRect = New-Object System.Drawing.RectangleF([float]($cx - $badgeR), [float]($cy - $badgeR), [float]$badgeD, [float]$badgeD)

    # Subtle drop shadow behind the central badge if transparent
    if ($transparentBg -and $badgeRatio -lt 0.9) {
        $shadowBadgeRect = New-Object System.Drawing.RectangleF([float]($cx - $badgeR), [float]($cy - $badgeR + 6.0 * $scale), [float]$badgeD, [float]$badgeD)
        $shadowBadgeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(45, 0, 0, 30))
        $g.FillEllipse($shadowBadgeBrush, $shadowBadgeRect)
        $shadowBadgeBrush.Dispose()
    }

    $badgeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $badgeRect,
        [System.Drawing.ColorTranslator]::FromHtml("#12008E"),
        [System.Drawing.ColorTranslator]::FromHtml("#0A0056"),
        90.0
    )
    $g.FillEllipse($badgeBrush, $badgeRect)
    $badgeBrush.Dispose()

    # Highlight border
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(50, 255, 255, 255), [float]([Math]::Max(1.0, 3.0 * $scale)))
    $g.DrawEllipse($borderPen, $badgeRect)
    $borderPen.Dispose()

    # Scale factor relative to standard 690px badge
    $pScale = ($badgeD / 690.0)

    $getPin = {
        param([float]$offsetY)
        $p = New-Object System.Drawing.Drawing2D.GraphicsPath
        $y = $offsetY * $scale
        
        $headCy = $cy - (105.0 * $pScale)
        $tipY = $cy + (110.0 * $pScale) + $y
        $headR = 115.0 * $pScale
        $holeR = 52.0 * $pScale
        
        $p.AddBezier([float]$cx, [float]($headCy - $headR + $y), [float]($cx - $headR * 0.75), [float]($headCy - $headR + $y), [float]($cx - $headR), [float]($headCy - $headR * 0.35 + $y), [float]($cx - $headR), [float]($headCy + $y))
        $p.AddBezier([float]($cx - $headR), [float]($headCy + $y), [float]($cx - $headR), [float]($headCy + $headR * 0.95 + $y), [float]($cx - 16.0 * $pScale), [float]($tipY - 25.0 * $pScale), [float]$cx, [float]$tipY)
        $p.AddBezier([float]$cx, [float]$tipY, [float]($cx + 16.0 * $pScale), [float]($tipY - 25.0 * $pScale), [float]($cx + $headR), [float]($headCy + $headR * 0.95 + $y), [float]($cx + $headR), [float]($headCy + $y))
        $p.AddBezier([float]($cx + $headR), [float]($headCy + $y), [float]($cx + $headR), [float]($headCy - $headR * 0.35 + $y), [float]($cx + $headR * 0.75), [float]($headCy - $headR + $y), [float]$cx, [float]($headCy - $headR + $y))
        $p.CloseFigure()

        # Hole
        $p.AddEllipse([float]($cx - $holeR), [float]($headCy - $holeR + $y), [float](2.0 * $holeR), [float](2.0 * $holeR))
        return $p
    }

    # Pin shadow
    $shadowPath = & $getPin (8.0 * $scale)
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 0, 0, 35))
    $g.FillPath($shadowBrush, $shadowPath)
    $shadowBrush.Dispose()
    $shadowPath.Dispose()

    # White pin
    $pinPath = & $getPin 0.0
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPath($whiteBrush, $pinPath)
    $whiteBrush.Dispose()
    $pinPath.Dispose()

    # Typography "Rotimize"
    $fontSize = [float](62.0 * $pScale)
    if ($fontSize -gt 6.0) {
        $font = New-Object System.Drawing.Font("Bahnschrift", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

        $sf = New-Object System.Drawing.StringFormat
        $sf.Alignment = [System.Drawing.StringAlignment]::Center
        $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

        $textY = $cy + (165.0 * $pScale)
        $textH = 75.0 * $pScale

        # Text shadow
        $textShadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(85, 0, 0, 45))
        $textShadowRect = New-Object System.Drawing.RectangleF(0, [float]($textY + 2.0 * $scale), [float]$canvasSize, [float]$textH)
        $g.DrawString("Rotimize", $font, $textShadowBrush, $textShadowRect, $sf)
        $textShadowBrush.Dispose()

        # Text main
        $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $textRect = New-Object System.Drawing.RectangleF(0, [float]$textY, [float]$canvasSize, [float]$textH)
        $g.DrawString("Rotimize", $font, $textBrush, $textRect, $sf)
        $textBrush.Dispose()
        $font.Dispose()
    }

    $g.Dispose()
    return $bmp
}

# 1. Generate src/assets/logo.png (1024x1024, Full HD with brand blue background)
Write-Output "Generating src/assets/logo.png..."
$logoFull = GenerateRotimizeBitmap 1024 0.70 $false $false
$logoFull.Save("c:\Projetos\Routes\src\assets\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$logoFull.Dispose()

# 2. Generate Android Splash Logo (1024x1024, transparent background, safe 56% ratio for Android 12+ 160dp circular mask)
Write-Output "Generating splash_logo.png for Android drawables..."
$drawableDir = "c:\Projetos\Routes\android\app\src\main\res\drawable"
$drawableNodpiDir = "c:\Projetos\Routes\android\app\src\main\res\drawable-nodpi"
if (-not (Test-Path $drawableNodpiDir)) {
    New-Item -ItemType Directory -Path $drawableNodpiDir -Force | Out-Null
}

$splashLogo = GenerateRotimizeBitmap 1024 0.56 $true $false
$splashLogo.Save("$drawableDir\splash_logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$splashLogo.Save("$drawableNodpiDir\splash_logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$splashLogo.Dispose()

# 3. Generate Android Mipmap Launcher Icons (square and round)
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
    Write-Output "Generating launcher icons for $folder ($px x $px)..."

    # Square / Adaptive foreground launcher icon (full background, 78% badge)
    $squareIcon = GenerateRotimizeBitmap $px 0.80 $false $false
    $squareIcon.Save("$folder\ic_launcher.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $squareIcon.Dispose()

    # Round launcher icon (circular clipped, 92% badge)
    $roundIcon = GenerateRotimizeBitmap $px 0.92 $false $true
    $roundIcon.Save("$folder\ic_launcher_round.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $roundIcon.Dispose()
}

Write-Output "ALL ASSETS GENERATED SUCCESSFULLY!"
