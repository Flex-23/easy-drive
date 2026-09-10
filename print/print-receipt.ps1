<#
    Draws a slip and sends it to a Windows printer — no dialog, no browser.

    The drawing is GDI+ (System.Drawing), not raw ESC/POS. Raw bytes are faster
    to the paper but the printer draws them from a code page, so anything the
    code page does not carry comes out as "?" and every layout is a fixed number
    of monospaced columns. GDI+ shapes text properly — Arabic joined and
    right-to-left, umlauts and € without a code page — measures it, and can place
    an image. That is why the QR codes arrive as PNGs.

    Without -PrinterName it uses whatever Windows has set as the default.

    Line format (see lib/printing/lines.ts):
      =text                centred, very large — the order number
      ~text                centred, bold
      -                    a rule across the paper
      --                   a dashed double rule — fences the kitchen's items
      (empty)              a blank line
      label<TAB>value      label at the left edge, value hard against the right
      !label<TAB>value     the same row in bold
      !text                a whole line in bold
      text                 a plain line
      IMG<TAB>mm<TAB>path  a PNG, centred and scaled to `mm` wide

    Two different things are called "direction" here, and they are decided
    separately:

      * How a *string* is laid out. A run of Arabic is drawn right-to-left so it
        comes out shaped and in the right order; anything else — a street, a
        phone number, a price — is drawn left-to-right. Laying a Latin phone
        number out RTL prints its groups back to front.

      * Which *column* a label and its value sit in. That belongs to the
        document, not to the string, because the prices have to line up in one
        column the whole way down. These slips print in German, so the label
        takes the left edge and the value the right. An Arabic name inside such a
        row still shapes right-to-left within its own box; the box does not move.

    Nothing is ever trimmed: a label and a value that will not fit side by side
    print on two lines instead, and a long centred line wraps.

    Usage: print-receipt.ps1 -Path <lines file> -WidthMm 58|80 [-PrinterName "XP-80C"]
           print-receipt.ps1 -Path <lines file> -WidthMm 58 -Preview out.png
#>
param(
    [Parameter(Mandatory = $true)][string] $Path,
    [string] $PrinterName = "",
    [ValidateSet(58, 80)][int] $WidthMm = 80,
    [string] $Preview = "",
    [string] $FontName = "Segoe UI"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $Path)) { throw "Slip file not found: $Path" }

$script:lines = [System.IO.File]::ReadAllLines($Path, [System.Text.Encoding]::UTF8)
$script:index = 0

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.DocumentName = "Easy Drive"

if ($PrinterName) { $doc.PrinterSettings.PrinterName = $PrinterName }
# A preview needs no printer at all, which is what makes it usable on a machine
# where the receipt printer is not plugged in.
if (-not $Preview -and -not $doc.PrinterSettings.IsValid) {
    throw "Printer not available: $($doc.PrinterSettings.PrinterName)"
}

# 58 mm leaves about 48 mm of print width, so the type comes down with it.
# Side margins are in hundredths of an inch.
if ($WidthMm -eq 58) {
    $bodySize = 7.5
    $margin = 8
} else {
    $bodySize = 9.5
    $margin = 14
}

# The bottom margin is its own, much larger number.
#
# On a thermal printer the cutter sits roughly 15 mm past the print head, so the
# last centimetre and a half of what was printed is still under the blade when
# the paper is cut — which is exactly how a footer comes out sliced lengthwise.
# Trailing blank lines cannot fix it: they draw no ink, and the printer ends the
# page at the last mark, so the paper never advances past them. Reserving the gap
# as margin is what actually keeps text out of the blade's path.
# 0.75 in ~ 19 mm: the cutter offset plus a little tolerance.
$bottomMargin = 75

$doc.DefaultPageSettings.Margins =
    New-Object System.Drawing.Printing.Margins($margin, $margin, $margin, $bottomMargin)

$script:font = New-Object System.Drawing.Font($FontName, $bodySize)
$script:bold = New-Object System.Drawing.Font($FontName, ($bodySize + 1), [System.Drawing.FontStyle]::Bold)
# The order number, and nothing else: it is what the kitchen and the driver
# search the slip for, so it is set well above every other line rather than one
# notch up. Scaled from the body size so each roll gets a heading in proportion.
$script:hero = New-Object System.Drawing.Font($FontName, ($bodySize * 1.9), [System.Drawing.FontStyle]::Bold)

function New-Format([bool] $Rtl, [System.Drawing.StringAlignment] $Alignment) {
    $format = New-Object System.Drawing.StringFormat
    if ($Rtl) {
        $format.FormatFlags = [System.Drawing.StringFormatFlags]::DirectionRightToLeft
    }
    $format.Alignment = $Alignment
    return $format
}

$near = [System.Drawing.StringAlignment]::Near
$centre = [System.Drawing.StringAlignment]::Center

$script:rtl       = New-Format $true  $near
$script:ltr       = New-Format $false $near
$script:rtlCentre = New-Format $true  $centre
$script:ltrCentre = New-Format $false $centre

# Arabic letters decide the direction of a line; digits and Latin do not.
function Test-Arabic([string] $Text) {
    return $Text -match "\p{IsArabic}"
}

$onPrintPage = {
    param($sender, $e)

    $g = $e.Graphics
    $bounds = $e.MarginBounds
    $width = [double]$bounds.Width
    $lineHeight = $script:font.GetHeight($g)
    $y = [double]$bounds.Top
    $black = [System.Drawing.Brushes]::Black

    # Draws one string across the full width, wrapping if needed, and reports how
    # much vertical space it took.
    function Write-Block([string] $Text, $Font, $Format) {
        $needed = $g.MeasureString($Text, $Font, [int]$width, $Format)
        $height = [Math]::Max([double]$needed.Height, $lineHeight)
        $rect = New-Object System.Drawing.RectangleF($bounds.Left, $y, $width, $height)
        $g.DrawString($Text, $Font, $black, $rect, $Format)
        return $height
    }

    while ($script:index -lt $script:lines.Length) {
        if (($y + $lineHeight) -gt $bounds.Bottom) {
            $e.HasMorePages = $true
            return
        }

        $line = $script:lines[$script:index]

        if ($line -eq "-") {
            $mid = $y + ($lineHeight / 2)
            $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1)
            $g.DrawLine($pen, $bounds.Left, $mid, $bounds.Right, $mid)
            $pen.Dispose()
            $y += $lineHeight
        }
        elseif ($line -eq "--") {
            $dash = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1)
            $dash.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
            $top = $y + ($lineHeight / 2) - 1.5
            $g.DrawLine($dash, $bounds.Left, $top, $bounds.Right, $top)
            $g.DrawLine($dash, $bounds.Left, $top + 3, $bounds.Right, $top + 3)
            $dash.Dispose()
            $y += $lineHeight
        }
        elseif ($line.StartsWith("=")) {
            $text = $line.Substring(1)
            $format = if (Test-Arabic $text) { $script:rtlCentre } else { $script:ltrCentre }
            $y += Write-Block $text $script:hero $format
        }
        elseif ($line.StartsWith("~")) {
            $text = $line.Substring(1)
            $format = if (Test-Arabic $text) { $script:rtlCentre } else { $script:ltrCentre }
            $y += Write-Block $text $script:bold $format
        }
        elseif ($line.StartsWith("IMG`t")) {
            # A pre-rendered image (a QR code), centred and scaled to a width in
            # millimetres. This comes before the tabbed-row case because the line
            # also contains tabs. Format: IMG<TAB>widthMm<TAB>absolutePath
            $imgParts = $line.Split("`t")
            $imgMm = [double]$imgParts[1]
            $imgPath = $imgParts[2]

            $targetPx = ($imgMm / 25.4) * $g.DpiX
            if ($targetPx -gt $width) { $targetPx = $width }

            $img = [System.Drawing.Image]::FromFile($imgPath)
            try {
                $drawH = $img.Height * ($targetPx / $img.Width)
                # No room left on this page: leave the line for the next one.
                if (($y + $drawH) -gt $bounds.Bottom) {
                    $e.HasMorePages = $true
                    return
                }
                $x = $bounds.Left + (($width - $targetPx) / 2)
                $rect = New-Object System.Drawing.RectangleF(
                    [single]$x, [single]$y, [single]$targetPx, [single]$drawH)

                # Nearest-neighbour keeps the QR modules square and scannable when
                # the printer's DPI differs from the PNG's; restored after so text
                # stays smooth.
                $oldMode = $g.InterpolationMode
                $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
                $g.DrawImage($img, $rect)
                $g.InterpolationMode = $oldMode

                $y += $drawH + ($lineHeight / 2)
            }
            finally {
                $img.Dispose()
            }
        }
        elseif ($line.Contains("`t")) {
            # "!" marks the row that matters most on a slip — the total.
            $strong = $line.StartsWith("!")
            $parts = ($(if ($strong) { $line.Substring(1) } else { $line })).Split("`t", 2)
            $label = $parts[0]
            $value = $parts[1]
            $rowFont = if ($strong) { $script:bold } else { $script:font }

            # Each side keeps its own direction: an Arabic dish name is laid out
            # right-to-left, a price or a phone number must not be.
            $labelFormat = if (Test-Arabic $label) { $script:rtl } else { $script:ltr }
            $valueFormat = if (Test-Arabic $value) { $script:rtl } else { $script:ltr }

            $labelWidth = [double]$g.MeasureString($label, $rowFont).Width
            $valueWidth = [double]$g.MeasureString($value, $rowFont).Width
            $rowHeight = [Math]::Max($rowFont.GetHeight($g), $lineHeight)

            if (($labelWidth + $valueWidth + 8) -le $width) {
                # Both fit: label anchored left, value right — the German order,
                # which is the language every slip prints in. Each is drawn inside
                # a box its own size, so a right-to-left string can shape itself
                # without dragging its column across the paper.
                if ($label) {
                    $labelRect = New-Object System.Drawing.RectangleF(
                        $bounds.Left, $y, ($labelWidth + 2), $rowHeight)
                    $g.DrawString($label, $rowFont, $black, $labelRect, $labelFormat)
                }
                $valueRect = New-Object System.Drawing.RectangleF(
                    ($bounds.Right - $valueWidth - 1), $y, ($valueWidth + 2), $rowHeight)
                $g.DrawString($value, $rowFont, $black, $valueRect, $valueFormat)
                $y += $rowHeight
            }
            else {
                # Too tight for one line: the value moves under its label rather
                # than either being cut short.
                if ($label) { $y += Write-Block $label $rowFont $labelFormat }
                $y += Write-Block $value $rowFont $valueFormat
            }
        }
        elseif ($line.Length -gt 0) {
            # "!" means bold here too, not only on a tabbed row: the kitchen slip
            # has no price column, so its dishes are full-width lines that still
            # have to stand out.
            $strongLine = $line.StartsWith("!")
            $text = if ($strongLine) { $line.Substring(1) } else { $line }
            $lineFont = if ($strongLine) { $script:bold } else { $script:font }
            $format = if (Test-Arabic $text) { $script:rtl } else { $script:ltr }
            $y += Write-Block $text $lineFont $format
        }
        else {
            $y += $lineHeight
        }

        $script:index++
    }

    $e.HasMorePages = $false
}

$doc.add_PrintPage($onPrintPage)

try {
    if ($Preview) {
        # Same handler, same fonts, same margins — only the surface differs. This
        # is how a layout is checked: on paper you cannot tell a clipped line from
        # a short one until the roll is already spent.
        $dpi = 96
        $pageWidth = [int](($WidthMm / 25.4) * $dpi)
        $pageHeight = 2000
        $inset = [int](($margin / 100) * $dpi)
        $bottomInset = [int](($bottomMargin / 100) * $dpi)

        $bitmap = New-Object System.Drawing.Bitmap($pageWidth, $pageHeight)
        $bitmap.SetResolution($dpi, $dpi)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

        $pageBounds = New-Object System.Drawing.Rectangle(0, 0, $pageWidth, $pageHeight)
        # The same asymmetric margins the printed page gets, so a preview cannot
        # show clearance the paper will not have.
        $marginBounds = New-Object System.Drawing.Rectangle(
            $inset, $inset, ($pageWidth - (2 * $inset)), ($pageHeight - $inset - $bottomInset))

        $eventArgs = New-Object System.Drawing.Printing.PrintPageEventArgs(
            $graphics, $marginBounds, $pageBounds, $doc.DefaultPageSettings)

        & $onPrintPage $null $eventArgs

        $graphics.Dispose()
        $bitmap.Save($Preview, [System.Drawing.Imaging.ImageFormat]::Png)
        $bitmap.Dispose()

        Write-Output "OK preview:$Preview ($WidthMm mm)"
    }
    else {
        $doc.Print()
        Write-Output "OK printed:$($doc.PrinterSettings.PrinterName) ($WidthMm mm)"
    }
}
finally {
    $doc.Dispose()
    $script:font.Dispose()
    $script:bold.Dispose()
    $script:hero.Dispose()
}
