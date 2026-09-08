Add-Type -AssemblyName System.Drawing

function CreateRotimizeImage([int]$size, [bool]$transparentBg, [bool]$includeSubtitle) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)

    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $scale = $size / 1024.0

    if (-not $transparentBg) {
        $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#1800AD"))
        $g.FillRectangle($bgBrush, 0, 0, $size, $size)
        $bgBrush.Dispose()

        # Ambient glow ring
        $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(25, 255, 255, 255), [float](3.0 * $scale))
        $g.DrawEllipse($ringPen, [float](137 * $scale), [float](137 * $scale), [float](750 * $scale), [float](750 * $scale))
        $ringPen.Dispose()
    }

    # Central Badge Circle (Diameter 690 at 1024, Center 512, 512)
    $badgeX = 167.0 * $scale
    $badgeY = 167.0 * $scale
    $badgeD = 690.0 * $scale
    $badgeRect = New-Object System.Drawing.RectangleF($badgeX, $badgeY, $badgeD, $badgeD)

    $badgeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $badgeRect,
        [System.Drawing.ColorTranslator]::FromHtml("#12008A"),
        [System.Drawing.ColorTranslator]::FromHtml("#0B0054"),
        90.0
    )
    $g.FillEllipse($badgeBrush, $badgeRect)
    $badgeBrush.Dispose()

    # Highlight border on badge
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(45, 255, 255, 255), [float](3.0 * $scale))
    $g.DrawEllipse($borderPen, $badgeRect)
    $borderPen.Dispose()

    # Location Pin Geometry function
    $getPin = {
        param([float]$offsetY)
        $p = New-Object System.Drawing.Drawing2D.GraphicsPath
        $y = $offsetY * $scale
        $cx = 512.0 * $scale

        # Cubic beziers scaled
        $p.AddBezier([float]$cx, [float]((235.0 * $scale) + $y), [float](420.0 * $scale), [float]((235.0 * $scale) + $y), [float](345.0 * $scale), [float]((310.0 * $scale) + $y), [float](345.0 * $scale), [float]((402.0 * $scale) + $y))
        $p.AddBezier([float](345.0 * $scale), [float]((402.0 * $scale) + $y), [float](345.0 * $scale), [float]((520.0 * $scale) + $y), [float](492.0 * $scale), [float]((625.0 * $scale) + $y), [float]$cx, [float]((655.0 * $scale) + $y))
        $p.AddBezier([float]$cx, [float]((655.0 * $scale) + $y), [float](532.0 * $scale), [float]((625.0 * $scale) + $y), [float](679.0 * $scale), [float]((520.0 * $scale) + $y), [float](679.0 * $scale), [float]((402.0 * $scale) + $y))
        $p.AddBezier([float](679.0 * $scale), [float]((402.0 * $scale) + $y), [float](679.0 * $scale), [float]((310.0 * $scale) + $y), [float](604.0 * $scale), [float]((235.0 * $scale) + $y), [float]$cx, [float]((235.0 * $scale) + $y))
        $p.CloseFigure()

        # Inner hole (diam 124 at 1024)
        $holeR = 62.0 * $scale
        $holeD = 124.0 * $scale
        $holeY = (402.0 * $scale) + $y - $holeR
        $p.AddEllipse([float]($cx - $holeR), [float]$holeY, [float]$holeD, [float]$holeD)

        return $p
    }

    # Pin soft shadow
    $shadowPath = & $getPin 10.0
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 0, 0, 35))
    $g.FillPath($shadowBrush, $shadowPath)
    $shadowBrush.Dispose()
    $shadowPath.Dispose()

    # Crisp white pin
    $pinPath = & $getPin 0.0
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPath($whiteBrush, $pinPath)
    $whiteBrush.Dispose()
    $pinPath.Dispose()

    # Typography "Rotimize"
    $fontSize = [float](74.0 * $scale)
    $font = New-Object System.Drawing.Font("Bahnschrift", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

    # Text shadow
    $textShadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 0, 0, 45))
    $textShadowRect = New-Object System.Drawing.RectangleF(0, [float](720.0 * $scale), [float]$size, [float](85.0 * $scale))
    $g.DrawString("Rotimize", $font, $textShadowBrush, $textShadowRect, $sf)
    $textShadowBrush.Dispose()

    # Text main
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $textRect = New-Object System.Drawing.RectangleF(0, [float](717.0 * $scale), [float]$size, [float](85.0 * $scale))
    $g.DrawString("Rotimize", $font, $textBrush, $textRect, $sf)
    $textBrush.Dispose()
    $font.Dispose()

    if ($includeSubtitle) {
        $subFontSize = [float](22.0 * $scale)
        $subFont = New-Object System.Drawing.Font("Bahnschrift", $subFontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
        $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 255, 255, 255))
        $subRect = New-Object System.Drawing.RectangleF(0, [float](785.0 * $scale), [float]$size, [float](40.0 * $scale))
        $g.DrawString("ROTEAMENTO INTELIGENTE", $subFont, $subBrush, $subRect, $sf)
        $subBrush.Dispose()
        $subFont.Dispose()
    }

    $g.Dispose()
    return $bmp
}

# Generate 1: Full HD Logo with background (1024x1024)
$logoFull = CreateRotimizeImage 1024 $false $false
$logoFull.Save("c:\Projetos\Routes\scratch\logo_full_1024.png", [System.Drawing.Imaging.ImageFormat]::Png)
$logoFull.Dispose()

# Generate 2: HD Splash Logo with transparent background (1024x1024) - for Android splash icon
$splashLogo = CreateRotimizeImage 1024 $true $false
$splashLogo.Save("c:\Projetos\Routes\scratch\splash_logo_1024.png", [System.Drawing.Imaging.ImageFormat]::Png)
$splashLogo.Dispose()

Write-Output "Generated HD assets successfully!"
