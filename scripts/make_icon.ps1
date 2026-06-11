# DeskMemo icon: MUJI-style kraft spiral memo pad (top double-ring binding)
# Output: build/icon.png (512), assets/icon-{16,32,256}.png (tray)
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$root\build" | Out-Null

function Draw-Icon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $s = $size / 512.0
    $kraft  = [System.Drawing.Color]::FromArgb(255, 203, 178, 130)
    $kraftD = [System.Drawing.Color]::FromArgb(255, 168, 143, 96)
    $coil   = [System.Drawing.Color]::FromArgb(255, 74, 74, 76)
    $hole   = [System.Drawing.Color]::FromArgb(255, 150, 126, 82)

    # pad body (portrait, below the coils)
    $padX = [int](96*$s); $padY = [int](120*$s)
    $padW = [int](320*$s); $padH = [int](340*$s)
    $brush = New-Object System.Drawing.SolidBrush($kraft)
    $g.FillRectangle($brush, $padX, $padY, $padW, $padH)
    $pw = [Math]::Max(1, [int](6*$s))
    $pen = New-Object System.Drawing.Pen($kraftD, $pw)
    $g.DrawRectangle($pen, $padX, $padY, $padW, $padH)

    # punched holes + wire coils across the top edge
    $coilPen = New-Object System.Drawing.Pen($coil, [Math]::Max(1, [int](14*$s)))
    $coilPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $coilPen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $holeBrush = New-Object System.Drawing.SolidBrush($hole)
    $n = 6
    for ($i = 0; $i -lt $n; $i++) {
        $cx = $padX + [int]((($i + 0.5) / $n) * $padW)
        # hole on the pad
        $hr = [int](12*$s)
        $g.FillEllipse($holeBrush, $cx - $hr, $padY + [int](18*$s) - $hr, $hr*2, $hr*2)
        # coil: ellipse loop passing through hole and over the top edge
        $cw = [int](24*$s); $ch = [int](84*$s)
        $g.DrawEllipse($coilPen, $cx - [int]($cw/2), $padY + [int](18*$s) - $ch + [int](14*$s), $cw, $ch)
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
