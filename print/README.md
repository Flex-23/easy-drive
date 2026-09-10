# Easy Drive — print agent

A server in Frankfurt cannot reach a printer in the shop. So the app builds the
slip where the data is, and this agent draws it where the paper is.

```
cloud app ──builds──▶ queue ──asks over HTTPS──▶ this agent ──▶ print-receipt.ps1 ──▶ paper
 (Vercel)           (database)                 (shop machine)      (GDI+)
```

Copy this folder anywhere on the shop's Windows machine. It needs **Node.js**
and nothing else — no npm install, no database password, no project checkout.

Two files do the work, and they must stay side by side:

| | |
| --- | --- |
| `print-agent.mjs` | the loop — asks for a job, lays its files out, reports back |
| `print-receipt.ps1` | draws the slip with GDI+ and prints it |

The agent knows nothing about receipts. What arrives is a finished document —
the slip's lines, its QR codes as PNG bytes, and which roll it was laid out for
— and all the agent does is write those to a temp folder and point the renderer
at them.

The drawing is GDI+ rather than raw ESC/POS bytes. Raw bytes reach the paper
faster, but the printer draws them from a code page, so anything the code page
does not carry prints as `?` and the layout can only be a fixed number of
monospaced columns. GDI+ shapes text properly — Arabic joined and right-to-left,
`ÄÖÜ` and `€` without a code page — measures it so nothing is ever cut off, and
can place an image. That last point is why QR codes arrive as PNGs instead of
using the printer's own QR command: the two cannot be mixed in one job.

### Checking the layout without spending a roll

`print-receipt.ps1` will draw to a PNG instead of to paper, through the very
same code, and it needs no printer attached to do it:

```powershell
powershell -File print-receipt.ps1 -Path slip.txt -WidthMm 80 -Preview out.png
```

## Setup

1. Copy `config.example.json` to `config.json` and fill it in:

   ```json
   {
     "appUrl": "https://your-app.vercel.app",
     "printKey": "the PRINT_AGENT_KEY set on the app"
   }
   ```

2. Double-click **`start-print.bat`**. Leave the window open — it prints a line
   for every ticket, so its state is readable at a glance.

To start it with Windows: <kbd>Win</kbd>+<kbd>R</kbd> → `shell:startup` → put a
shortcut to `start-print.bat` there. For a machine that must print after a
reboot with nobody logged in, use Task Scheduler with *Run whether user is
logged on or not*.

## What it does when things go wrong

| | |
| --- | --- |
| No internet, or the app is asleep | Says so once, keeps asking, prints everything waiting the moment it is back |
| Printer off or out of paper | Reports the printer's own error, retries up to five times, then leaves the job `FAILED` for someone to look at |
| Two agents started by accident | Impossible to print one ticket twice — a job is claimed with a conditional update |
| Crash or power cut mid-print | The batch file restarts it; a job left half-claimed is offered again |

## Files

| | |
| --- | --- |
| `print-agent.mjs` | The agent. No dependencies. |
| `print-receipt.ps1` | Draws the slip with GDI+ and hands the page to the printer. Must stay beside the agent. |
| `config.json` | Your app address and key. Not committed. |
| `start-print.bat` | Runs the agent and restarts it if it ever stops. |

The agent contains no menu, no prices and no receipt layout: the slip reaches it
finished. That is why it never needs updating when the app changes — but
`print-receipt.ps1` is the layout, so if that file changes in the project, copy
the new one over and restart the agent.
