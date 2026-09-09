# Easy Drive — print agent

A server in Frankfurt cannot reach a printer in the shop. So the app renders the
ticket where the data is, and this agent moves the finished bytes to where the
paper is.

```
cloud app ──renders──▶ queue ──asks over HTTPS──▶ this agent ──▶ spooler ──▶ paper
 (Vercel)            (database)                 (shop machine)
```

Copy this folder anywhere on the shop's Windows machine. It needs **Node.js**
and nothing else — no npm install, no database password, no project checkout.

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
| `print-raw.ps1` | Hands bytes to the Windows spooler as a RAW job, so the ESC/POS commands (cut, QR, emphasis) survive. Must stay beside the agent. |
| `config.json` | Your app address and key. Not committed. |
| `start-print.bat` | Runs the agent and restarts it if it ever stops. |

The agent contains no menu, no prices and no receipt layout: the bytes reach it
finished. That is why it never needs updating when the app changes.
