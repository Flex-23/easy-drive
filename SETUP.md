# Easy Drive — Setup

Easy Drive is a bilingual (Arabic / German) restaurant point-of-sale terminal
built with Next.js (App Router), TypeScript, Prisma, PostgreSQL (Supabase) and
Tailwind CSS v4.

## Prerequisites

- **Node.js 20.9+** (developed on Node 24)
- A **Supabase project** — it hosts the PostgreSQL database

## 1. Create the Supabase project

In [supabase.com](https://supabase.com) create a project and note its database
password. **Choose the region closest to the shop** — every screen the cashier
opens is a round trip to it, so the distance is felt directly at the till. For a
restaurant in Germany that is `eu-central-1` (Frankfurt). See *Latency* below
for what the wrong region costs.

Nothing else in the dashboard needs configuring: the app uses Supabase purely as
a Postgres server. It does not use Supabase Auth (sign-in is a PIN against the
`User` table), Storage, or Realtime, so `@supabase/supabase-js` is **not** a
dependency of this project.

## 2. Configure the connection

Copy `.env.example` to `.env` and fill in both URLs from the dashboard
(**Project settings → Database → Connection string → Prisma**):

```
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

Supabase offers two ports, and **which one `DATABASE_URL` uses depends on where
the app is running.** Getting this wrong takes the site down, so it is worth the
paragraph:

| Where | Port | Why |
| --- | --- | --- |
| A host that scales (Vercel) | **6543** + `?pgbouncer=true&connection_limit=1` | Every request may land on a fresh instance with its own pool. The transaction pooler multiplexes them; the session pooler runs out. |
| The shop's own machine | **5432** + `?connection_limit=4` | One long-running server, and from there 5432 measured 80 ms per query against 380 ms through 6543. |

The session pooler allows about **15 clients for the whole project**. Point a
scaling host at it and it will exhaust them, and then *everything* fails —
including the till — with `FATAL: (EMAXCONNSESSION) max clients reached in
session mode`. That is why the local URL carries a `connection_limit` too: one
dev server must not be able to lock the shop out.

`DIRECT_URL` is always 5432. Migrations need a real session for advisory locks,
which a transaction pooler cannot hold.

Set `MASTER_SESSION_SECRET` too. Without it the cookie signing key is derived
from `DATABASE_URL`, so changing database would sign everyone out.

`.env` is git-ignored; `.env.example` is committed as a template.

## 3. Install, migrate and seed

```bash
npm install
npx prisma migrate deploy       # creates the schema in the Supabase project
npx prisma db seed              # idempotent: 15 categories, 65 items, staff,
                                # ~15 customers and ~40 historical orders
```

Use `npx prisma migrate dev` instead while changing the schema — it writes a new
migration; `deploy` only applies the ones already committed.

## Latency

The database is no longer on the shop's own machine, and two things follow.

**The till needs the internet.** No connection means no orders and no printing.

**Distance is measured in seconds, not milliseconds.** The project lives in
Frankfurt (`eu-central-1`), a TCP handshake away from the shop at ~83 ms and a
query at ~80 ms. The same project in Seoul was measured at 820 ms and 305 ms,
and it showed on every screen:

| Screen (production build) | Frankfurt | Seoul |
| --- | --- | --- |
| New Order | 2.0 s | 6.2 s |
| Orders board | 0.32 s | 0.8 s |
| Daily report | 0.60 s | 2.2 s |
| Panel · Menu | 1.9 s | 6.7 s |
| Panel · Sales | 0.43 s | 3.6 s |

If the till feels slow, check the region before reading any code. And run the
production build — `npm run build && npm start`, not `npm run dev`.

## 5. Run

```bash
npm run dev                     # http://localhost:3000  (Turbopack)
```

Visiting `/` redirects to `/de`, which asks for a
**cashier PIN** at `/de/login` and then opens on the **New Order** screen. Only
accounts with the **cashier** role can sign in here — an admin PIN is refused
with a message asking for a cashier account, so the till and the Master panel
are two separate identities. Every order is booked under whoever is signed in,
and the top bar's exit icon ends the shift. The seed ships two cashiers
(`2345`, `3456`).

Screens (icon rail): **New Order**, **Orders**, **Daily Report**, **Settings**.

Nothing is paid at the till. **Bestellung senden** files the finished cart as a
pending order, **prints two copies at once** — the customer's and the kitchen's
— and the order appears on the **Orders** board carrying its type, pickup or
delivery, as its state. The board is where an order is settled:

| Order | What the detail form offers |
| --- | --- |
| Delivery | a driver number (**Enter** dispatches it — the driver collects), *online paid*, or cancel |
| Pickup | **cash** or **online**, or cancel |

A settled order leaves the waiting column and joins the processed one under its
driver, the cash pile, the online pile, or the cancelled pile. A pickup paid this
way is complete; a delivery paid online comes off its driver, since there is no
longer money to collect at the door.

The same form prints the order three ways:

| Ticket | What is on the paper |
| --- | --- |
| **Customer receipt** | no shop or software name at all: date, time and order number, then the items with prices, subtotal, discount, delivery fee, VAT, total and how it was paid, closing with **Kein offizieller Beleg** |
| **Kitchen** | only what to cook — quantities, item names and numbers, options and kitchen notes in large type, no money at all |
| **Address + QR** | the customer's name, phone and address written out, and the same address as a QR code the printer draws itself — scanning it opens navigation (a pickup encodes the order and customer instead) |

Every ticket goes straight to the thermal printer — see **Printing** below.

Order numbers read **`BE003QG`** — two letters, the order's number within the
business day, two letters. The letters are the day itself written in base 26, so
no two days can produce the same pair and the number is unique without a lookup.

Each column prints. **Pending** prints the waiting orders with their count and
grand total. **Processed** prints at the scope shown in its chip: *all* (a line
per driver plus the paid-online and cancelled piles, and a settlement summary of
what the drivers hold against what came in online), *drivers only* (the bike
button), or a single group — click the circle beside a driver, the paid-online
pile or the cancelled pile to select it, and the printout narrows to that
group's orders, count and total, noting for a driver how much of the round was
already paid for. The chip's ✕ clears the selection.

**Park a bill** with the pause button in the cart: it is saved with status
`HELD` and reappears under **Parked bills** in the order header, with a badge
for how many are waiting. Opening it lists each one with its items, and
**Resume** brings the bill — items, customer and discount — back to the till and
**unparks it there and then**, so the list only ever shows bills that are still
waiting; re-parking it writes a fresh row. Its lines are rebuilt against today's
menu, and anything since removed from the menu is dropped with a notice.

The **Daily Report** always shows today and carries the KPI tiles and hourly
revenue chart. Payments are reported as **cash or electronic** — a card
terminal and an online payment both mean the money never entered the drawer, so
`CARD` is counted with `ONLINE` (orders still store the exact method). Its
**Print report** button produces a day-close sheet: takings, average ticket and
order count; the cash/electronic split; delivery / pickup / dine-in; the
delivery detail with each driver's orders and money plus a total row; the
paid-online, cancelled and still-out tallies; and the print timestamp.

## The Master panel

The back office lives at **`/panel`** — a separate URL tree with its own root
layout, its own session and no link either way (no icon in the POS rail, no
link back to the till; you reach each by its own address). The two sessions are
independent: their cookies are signed with different keys, so neither token is
usable on the other side, and an admin who also wants to serve customers needs a
cashier account of their own. Sign in at **`/panel/login`**
with any active **admin**'s four-digit PIN (the seed ships `1234`); `/panel`
itself opens straight onto the catalogue. The session
cookie is HMAC-signed, `httpOnly`, scoped to `/panel` and valid for eight hours;
failed PIN attempts are throttled to five per five minutes. Every panel Server
Action re-checks the session, because an action is a public POST endpoint.

| Tab | What it does |
| --- | --- |
| Menu | Create, edit, show/hide and delete categories and dishes — one name and description (typed in the language in use and shown in both), price or sizes, item number, popular flag |
| Staff | Add admins and cashiers with a 4-digit PIN (hashed with scrypt), change role/colour/PIN, activate or delete |
| Sales | Day or month: revenue, orders, average ticket, cancellations, an hourly (day) or daily (month) chart, split by order type, payment method, cashier and driver, plus the top ten dishes |

There are no dish photos: the till is a keyboard, not a catalogue, and a
cashier finds a dish by its number faster than by its picture.

### Sizes

A dish either has **one price** or a **list of sizes**, each with the full price
the customer pays — `26 cm 8,50`, `30 cm 11,00`, `40 cm 16,90`. Add a size in
the dish form and the single price field gives way to the list; empty the list
and it comes back. The **first size is the default** the cashier starts on, and
its price is the one the product card quotes, prefixed *ab* (`ab 8,50 €`).

Underneath, a size list is an option group of kind `SIZE`: the first size sets
the dish's `basePrice` and every size is stored as its difference from it, which
is the form the POS already prices lines in ([lib/pricing.ts](lib/pricing.ts)).
So the panel talks in prices, the till talks in surcharges, and neither has to
know about the other. One `SIZE` group per dish; the extras beside it (dips,
drinks, spice level) are `EXTRA` groups and are left untouched by the panel.
Sizes show their **own price** in the product modal, extras show a **+ surcharge**.

Guard rails: a category holding dishes cannot be deleted (the schema would
cascade them away), a dish that already appears on an order can only be
deactivated, a user with orders cannot be deleted, and the last active admin can
never be removed or demoted. Revenue on the Sales tab uses the same definition
as the Daily Report — created in range, not cancelled, carrying a payment method.

Both areas are guarded in the page itself and not only in the layout: a layout
and its page render in parallel, so a layout-only redirect can still let the
page's data reach the streamed HTML. The proxy adds a cookie-presence check so
an unauthenticated visitor gets a plain redirect before anything renders.

## Language and the business day

Each area has a fixed language: the till and everything around it are **German**
(`/de/…`, an `/ar` link redirects there) and the Master panel is **Arabic**. There
is no switcher — the policy lives in `posLocale` / `panelLocale` in
[lib/i18n/config.ts](lib/i18n/config.ts). Theme (light / dark / system) still
toggles in the top bar.

The shop day is not the calendar day. A **business day runs 05:00 → 05:00
Europe/Berlin**: a bill rung up at 02:00 on 7 September still belongs to
6 September, and the orders board empties itself at 05:00 — nothing is deleted,
yesterday's rows simply stop crowding the dispatcher's screen and stay in the
reports. The daily report, the board and the panel's sales all take their bounds
from [lib/business-day.ts](lib/business-day.ts), which anchors to Berlin
explicitly (DST included) rather than to the machine's clock.

## Printing

The app runs on the shop's own computer, so it prints there directly: every
ticket is built as **ESC/POS** bytes and handed to the Windows spooler as a RAW
job through `scripts/print-raw.ps1`. No browser dialog, no printer driver
rendering, no third-party print service — and nothing to install beyond the
printer itself.

Choose the printer in **Settings → Receipt**: the list comes from Windows
(`Get-Printer`), next to it the paper width (80 mm = 48 characters, 58 mm = 32)
and a **Testdruck** button that prints a short slip with umlauts, € and a full-
width rule so you can confirm both at once.

| Printed | When |
| --- | --- |
| Customer copy + kitchen bon | automatically, the moment an order is sent from the till |
| Customer copy / kitchen bon / address label | on demand, from the order's detail form on the board |
| Waiting and processed reports | the printer buttons on the orders board |
| Day-close sheet | the print button on the daily report |

The QR on the address label is drawn by the printer itself (ESC/POS QR
command), so it costs a few bytes rather than an image and stays sharp.
Text is encoded as **CP858**, which carries ä ö ü ß and €.

### Printing from the cloud — the print agent

A server in Frankfurt cannot reach a printer in the shop, so the app takes the
other road: it renders the ticket where the data is and moves the **finished
bytes** to where the paper is.

```
cloud app ──renders──▶ PrintJob ──asks over HTTPS──▶ print agent ──▶ spooler ──▶ paper
 (Vercel)             (Supabase)                    (shop machine)
```

On the shop machine nothing changes — the app still prints directly. On any
other host `send()` writes the job into `PrintJob` instead, and the agent in
[print/](print/) claims it through `POST /api/print-jobs` and prints it.

The [print/](print/) folder is meant to be **copied anywhere on the shop's
machine**: it needs Node.js and nothing else — no `npm install`, no database
password, no checkout of this project. Fill in `config.json` (the app's address
and `PRINT_AGENT_KEY`) and double-click `start-print.bat`. See
[print/README.md](print/README.md).

What the agent does not contain is the point of it: no menu, no prices, no
receipt layout. The bytes reach it finished, so it needs only a printer, and it
does not change when the app does.

The queue is honest about failure: a job is claimed with a conditional update
(two agents can never print the same ticket twice), retried up to five times,
and left `FAILED` carrying the printer's own error when the paper really is out.
Printed jobs are swept a day later.

`PRINT_AGENT_KEY` must be set on the app — while it is empty `/api/print-jobs`
answers 503 and nothing can drain the queue.
## The look

Everything visual comes from the tokens at the top of
[app/globals.css](app/globals.css) — colours, radii, and three shadow steps.
Change `--accent` there and the whole product re-skins; no component carries a
hardcoded colour. Light and dark are both designed, not inverted.

Four rules the interface keeps:

- **Surfaces.** `bg` is the room, `surface` the paper on it, `surface-raised`
  a card lifted off that paper, `surface-muted` a quiet band, and
  `surface-sunken` a well (inputs, tracks). Shadows are warm-tinted and all
  fall from the same light above the screen.
- **Answering the touch.** `.press` transitions the named properties and
  scales to 0.97 on press; `.card-lift` raises a card 2px under a pointer.
  The lift is wrapped in `@media (hover: hover)` — on a touch till a plain
  `:hover` sticks to the last thing tapped and reads as a stuck button.
- **Selection.** `.is-selected` marks the chosen thing with an accent ring
  rather than a colour swap, so the element keeps its surface and its text
  keeps its contrast.
- **Focus.** One soft accent ring, offset, from `--ring`; keyboard only.

Empty lists use [`EmptyState`](components/ui/empty-state.tsx) — an icon in a
quiet disc over a line of text — so a screen with nothing on it still reads as
a state the app expected rather than a failure.
## Verifying / other commands

```bash
npx prisma validate     # schema is valid
npm run lint            # ESLint (flat config) — zero errors
npm run build           # production build + TypeScript check
npm run db:seed         # alias for `prisma db seed`
```

External channels:

```bash
# Menu for an external client
curl "http://localhost:3000/api/menu?locale=de"

# Ingest an online order (lands on the orders board as a pending order).
# Once ORDER_API_KEY is set in .env, add: -H "X-Api-Key: <that key>"
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"type":"DELIVERY","customer":{"name":"Max","phone":"01511 2223344"},
       "address":{"street":"Teststr","houseNumber":"1","postalCode":"10115","city":"Berlin"},
       "lines":[{"itemNumber":301,"quantity":2,"choiceIds":[]}]}'
```

## Common pitfalls

- **`P1001: Can't reach database server`** — the machine is offline, or the
  Supabase project is paused (free projects pause after a week idle; resume it
  in the dashboard).
- **`P1000: Authentication failed`** — the password in both URLs must be the
  database password from **Project settings → Database**, not the API keys. If
  it contains `@ : / ?` or `#`, percent-encode it.
- **`prisma migrate` hangs or reports a lock error** — `DIRECT_URL` is pointing
  at port 6543. Migrations need the session pooler on 5432.
- **The till is slow** — check the project's region before anything else; see
  *Latency* above.
- **`prisma migrate` can't find `.env`** — run commands from the project root so
  Prisma picks up `./.env`.

### Moving the database again

The whole database is 15 tables and no binary data, so a move is a dump and a
restore, not a project. Snapshot every table to JSON with the current
`DATABASE_URL`, point the two URLs at the new server, run `prisma migrate
deploy`, then insert the JSON back in parent-before-child order — and afterwards
push each id sequence past what you inserted, or the first new row collides:

```sql
SELECT setval(pg_get_serial_sequence('"MenuItem"', 'id'), (SELECT max(id) FROM "MenuItem"));
```
