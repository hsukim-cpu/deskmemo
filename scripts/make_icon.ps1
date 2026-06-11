# DeskMemo icon: yellow sticky note + folded corner + three text lines
# Output: build/icon.png (512, for electron-builder ico/icns), assets/icon-{16,32,256}.png (tray)
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$root\build" | Out-Null

function Draw-Icon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $s = $size / 512.0
    $paper = [System.Drawing.Color]::FromArgb(255, 250, 215, 100)
    $fold  = [System.Drawing.Color]::FromArgb(255, 214, 173, 55)
    $line  = [System.Drawing.Color]::FromArgb(190, 150, 117, 30)

    $body = @(
        (New-Object System.Drawing.PointF([float](64*$s),  [float](56*$s))),
        (New-Object System.Drawing.PointF([float](448*$s), [float](56*$s))),
        (New-Object System.Drawing.PointF([float](448*$s), [float](320*$s))),
        (New-Object System.Drawing.PointF([float](320*$s), [float](456*$s))),
        (New-Object System.Drawing.PointF([float](64*$s),  [float](456*$s)))
    )
    $brush = New-Object System.Drawing.SolidBrush($paper)
    $g.FillPolygon($brush, $body)

    $flap = @(
        (New-Object System.Drawing.PointF([float](448*$s), [float](320*$s))),
        (New-Object System.Drawing.PointF([float](320*$s), [float](456*$s))),
        (New-Object System.Drawing.PointF([float](320*$s), [float](320*$s)))
    )
    $fbrush = New-Object System.Drawing.SolidBrush($fold)
    $g.FillPolygon($fbrush, $flap)

    $lbrush = New-Object System.Drawing.SolidBrush($line)
    $h = [Math]::Max(1, [int](26*$s))
    foreach ($row in @(@(128, 320), @(196, 296), @(264, 240))) {
        $y = [int]($row[0]*$s)
        $w = [int]($row[1]*$s)
        $g.FillRectangle($lbrush, [int](112*$s), $y, $w, $h)
    }

    $g.Dispose()
    return $bmp
}

$targets = @(
    @{ size = 512; path = "$root\build\icon.png" },
    @{ size = 256; path = "$root\assets\icon-256.png" },
    @{ size = 32;  path = "$root\assets\icon-32.png" },
    @{ size = 16;  path = "$root\assets\icon-16.png" }
)
foreach ($t in $targets) {
    $bmp = Draw-Icon $t.size
    $bmp.Save($t.path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output ("saved " + $t.path)
}
