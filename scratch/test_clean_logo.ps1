Add-Type -AssemblyName System.Drawing

function GenerateCleanLogo([int]$size, [bool]$transparentBg, [string]$outputPath) {
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
    }

    $cx = $size / 2.0
    $cy = $size / 2.0

    # Pin Geometry - Clean, centered, elegant without ANY circle around it
    $headCy = $cy - (60.0 * $scale)
    $headR  = 145.0 * $scale
    $tipY   = $cy + (210.0 * $scale)
    $holeR  = 65.0 * $scale

    $getPin = {
        param([float]$offsetY)
        $p = New-Object System.Drawing.Drawing2D.GraphicsPath
        $y = $offsetY * $scale

        $p.AddBezier(
            [float]$cx, [float]($headCy - $headR + $y),
            [float]($cx - $headR * 0.78), [float]($headCy - $headR + $y),
            [float]($cx - $headR), [float]($headCy - $headR * 0.35 + $y),
            [float]($cx - $headR), [float]($headCy + $y)
        )
        $p.AddBezier(
            [float]($cx - $headR), [float]($headCy + $y),
            [float]($cx - $headR), [float]($headCy + $headR * 0.95 + $y),
            [float]($cx - 20.0 * $scale), [float]($tipY - 30.0 * $scale + $y),
            [float]$cx, [float]($tipY + $y)
        )
        $p.AddBezier(
            [float]$cx, [float]($tipY + $y),
            [float]($cx + 20.0 * $scale), [float]($tipY - 30.0 * $scale + $y),
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

    # Soft subtle shadow under pin
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
    $fontSize = [float](82.0 * $scale)
    $font = New-Object System.Drawing.Font("Bahnschrift", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

    $textY = $cy + (265.0 * $scale)
    $textH = 95.0 * $scale

    # Text shadow
    $textShadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(45, 0, 0, 45))
    $textShadowRect = New-Object System.Drawing.RectangleF(0, [float]($textY + 3.0 * $scale), [float]$size, [float]$textH)
    $g.DrawString("Rotimize", $font, $textShadowBrush, $textShadowRect, $sf)
    $textShadowBrush.Dispose()

    # Text main
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $textRect = New-Object System.Drawing.RectangleF(0, [float]$textY, [float]$size, [float]$textH)
    $g.DrawString("Rotimize", $font, $textBrush, $textRect, $sf)
    $textBrush.Dispose()
    $font.Dispose()

    $g.Dispose()
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

GenerateCleanLogo 1024 $false "c:\Projetos\Routes\scratch\test_clean_logo.png"
GenerateCleanLogo 1024 $true "c:\Projetos\Routes\scratch\test_clean_transparent.png"
Write-Output "Generated clean images without circle"
