# Draws the app icon: a white "SA" on the sidebar's blue, in a rounded square.
# Run once from the desktop folder:  powershell -File make-icon.ps1
Add-Type -AssemblyName System.Drawing

$size = 512
$out = Join-Path $PSScriptRoot 'assets'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::Transparent)

# rounded square, the same blue as the sidebar tile (#2d4ea2 -> #4468c4 at the top)
$r = 112
$pad = 16
$d = $r * 2
$rect = New-Object System.Drawing.Rectangle $pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
$path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
$path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
$path.CloseFigure()
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 0x44, 0x68, 0xC4)), ([System.Drawing.Color]::FromArgb(255, 0x2D, 0x4E, 0xA2)), 90
$g.FillPath($brush, $path)

# the letters
$font = New-Object System.Drawing.Font 'Segoe UI Semibold', 210, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$fmt.LineAlignment = 'Center'
$textRect = New-Object System.Drawing.RectangleF 0, 8, $size, $size
$g.DrawString('SA', $font, [System.Drawing.Brushes]::White, $textRect, $fmt)

$png = Join-Path $out 'icon.png'
$bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)

# .ico with one 256 px PNG image inside (Windows Vista and later read this)
$small = New-Object System.Drawing.Bitmap 256, 256
$g2 = [System.Drawing.Graphics]::FromImage($small)
$g2.InterpolationMode = 'HighQualityBicubic'
$g2.DrawImage($bmp, 0, 0, 256, 256)
$ms = New-Object System.IO.MemoryStream
$small.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bytes = $ms.ToArray()
$fs = [System.IO.File]::Create((Join-Path $out 'icon.ico'))
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)          # header: 1 image
$bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0)  # 256x256, no palette
$bw.Write([UInt16]1); $bw.Write([UInt16]32)                                # planes, bits
$bw.Write([UInt32]$bytes.Length); $bw.Write([UInt32]22)                    # size, offset
$bw.Write($bytes)
$bw.Close(); $fs.Close()

$g.Dispose(); $g2.Dispose(); $bmp.Dispose(); $small.Dispose()
Write-Output "Wrote $png and icon.ico"
