Add-Type -AssemblyName System.Drawing

$width = 1024
$height = 1024
$bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)

$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# 1. Background vibrant brand blue
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#1800AD"))
$g.FillRectangle($bgBrush, 0, 0, $width, $height)

# 2. Ambient radial glow behind the center badge
$glowCenter = New-Object System.Drawing.PointF(512, 512)
$glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$glowPath.AddEllipse(64, 64, 896, 896)
$pbg = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
$pbg.CenterPoint = $glowCenter
$pbg.CenterColor = [System.Drawing.Color]::FromArgb(60, 45, 35, 255)
$pbg.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 24, 0, 173))
$g.FillPath($pbg, $glowPath)
$pbg.Dispose()
$glowPath.Dispose()

# 3. Outer subtle ring
$ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(25, 255, 255, 255), 3)
$g.DrawEllipse($ringPen, 137, 137, 750, 750)
$ringPen.Dispose()

# 4. Central Badge Circle (Diameter 690, Center 512, 512 -> Rect: 167, 167, 690, 690)
$badgeRect = New-Object System.Drawing.Rectangle(167, 167, 690, 690)
$badgeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $badgeRect,
    [System.Drawing.ColorTranslator]::FromHtml("#14008E"),
    [System.Drawing.ColorTranslator]::FromHtml("#0B0058"),
    90.0
)
$g.FillEllipse($badgeBrush, $badgeRect)
$badgeBrush.Dispose()

# Subtle highlight border on badge
$badgeBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(45, 255, 255, 255), 3)
$g.DrawEllipse($badgeBorder, $badgeRect)
$badgeBorder.Dispose()

# 5. Location Pin Geometry function
function GetPinPath([float]$offsetY) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $y = $offsetY

    # Start top center (512, 235 + y)
    # Curve 1: Left top quadrant
    $path.AddBezier(512, 235 + $y, 420, 235 + $y, 345, 310 + $y, 345, 402 + $y)
    # Curve 2: Left side down to bottom tip (512, 655 + y)
    $path.AddBezier(345, 402 + $y, 345, 520 + $y, 492, 625 + $y, 512, 655 + $y)
    # Curve 3: Right side from bottom tip up to right side
    $path.AddBezier(512, 655 + $y, 532, 625 + $y, 679, 520 + $y, 679, 402 + $y)
    # Curve 4: Right top quadrant back to top center
    $path.AddBezier(679, 402 + $y, 679, 310 + $y, 604, 235 + $y, 512, 235 + $y)
    $path.CloseFigure()

    # Inner hole circle centered at (512, 402 + y), radius 62 -> diam 124
    $path.AddEllipse([float](512 - 62), [float](402 + $y - 62), 124, 124)

    return $path
}

# Soft shadow under pin
$shadowPath = GetPinPath 10
$shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 0, 0, 35))
$g.FillPath($shadowBrush, $shadowPath)
$shadowBrush.Dispose()
$shadowPath.Dispose()

# Crisp white pin
$pinPath = GetPinPath 0
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.FillPath($whiteBrush, $pinPath)
$whiteBrush.Dispose()
$pinPath.Dispose()

# 6. Typography "Rotimize"
# Choose high quality font
$fontName = "Bahnschrift"
$font = New-Object System.Drawing.Font($fontName, 70, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

# Text shadow
$textShadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 0, 0, 45))
$textShadowRect = New-Object System.Drawing.RectangleF(0, 723, 1024, 85)
$g.DrawString("Rotimize", $font, $textShadowBrush, $textShadowRect, $sf)
$textShadowBrush.Dispose()

# Text main
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$textRect = New-Object System.Drawing.RectangleF(0, 720, 1024, 85)
$g.DrawString("Rotimize", $font, $textBrush, $textRect, $sf)
$textBrush.Dispose()

# Save output
$outPath = "c:\Projetos\Routes\scratch\logo_test3.png"
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
Write-Output "SUCCESS: $outPath generated!"
