<#
    Sends a file to a Windows printer as a RAW job.

    RAW means the bytes reach the printer untouched — no driver rendering, no
    dialog — which is the only way ESC/POS commands (cut, QR, emphasis) survive.
    The spooler API is reached through P/Invoke so the app needs no native
    module and no third-party print service.

    The P/Invoke wrapper is compiled once and cached beside this script: building
    it from source costs about a second, and it is otherwise rebuilt for every
    single receipt. Delete the .dll to force a rebuild.

    Usage: print-raw.ps1 -Printer "XP-80C" -File "<path to the job's bytes>"
#>
param(
    [Parameter(Mandatory = $true)][string]$Printer,
    [Parameter(Mandatory = $true)][string]$File
)

$ErrorActionPreference = "Stop"

$cache = Join-Path $env:TEMP "easy-drive-rawprinter.dll"
$source = @'
using System;
using System.Runtime.InteropServices;

public class EasyDriveRawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFO di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void Send(string printerName, byte[] bytes)
    {
        IntPtr printer;
        if (!OpenPrinter(printerName, out printer, IntPtr.Zero))
            throw new Exception("Printer not found or not available: " + printerName);

        IntPtr buffer = IntPtr.Zero;
        try
        {
            DOCINFO info = new DOCINFO();
            info.pDocName = "Easy Drive";
            info.pDataType = "RAW";

            if (!StartDocPrinter(printer, 1, ref info)) throw new Exception("StartDocPrinter failed");
            if (!StartPagePrinter(printer)) throw new Exception("StartPagePrinter failed");

            buffer = Marshal.AllocCoTaskMem(bytes.Length);
            Marshal.Copy(bytes, 0, buffer, bytes.Length);

            int written;
            if (!WritePrinter(printer, buffer, bytes.Length, out written))
                throw new Exception("WritePrinter failed");

            EndPagePrinter(printer);
            EndDocPrinter(printer);
        }
        finally
        {
            if (buffer != IntPtr.Zero) Marshal.FreeCoTaskMem(buffer);
            ClosePrinter(printer);
        }
    }
}
'@

if (Test-Path $cache) {
    try {
        Add-Type -Path $cache
    }
    catch {
        # A truncated or stale cache is worth nothing; rebuild it.
        Remove-Item $cache -Force -ErrorAction SilentlyContinue
    }
}

if (-not ("EasyDriveRawPrinter" -as [type])) {
    Add-Type -TypeDefinition $source -OutputAssembly $cache -PassThru | Out-Null
    Add-Type -Path $cache
}

$bytes = [System.IO.File]::ReadAllBytes($File)
[EasyDriveRawPrinter]::Send($Printer, $bytes)
Write-Output "OK"
