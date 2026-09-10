# Easy Drive

Point of sale and delivery dispatch for a single restaurant. Two areas, one
database:

- **The till** (`/de`) — take an order, park it, recall it, hand it to a driver,
  settle it, close the day. German, no language switcher.
- **The Master panel** (`/panel`) — the owner's screen: menu, staff, sales.
  Arabic, its own sign-in, its own session.

Both are Next.js App Router on PostgreSQL (Supabase) via Prisma. Receipts are
built on the server as directive lines and drawn on the shop's machine with
GDI+ — directly when the app runs there, through the print agent when it runs in
the cloud.

## Running it

```bash
cp .env.example .env      # then fill in the two Supabase URLs
npm install
npx prisma migrate deploy
npm run db:seed           # menu, settings, and the first admin PIN
npm run dev
```

**[SETUP.md](SETUP.md) is the real documentation** — which Supabase pooler to
point at (getting this wrong takes the site down), how to seed, how printing is
wired, and what to do when something is wrong. Read it before deploying.

## Layout

| Path | What lives there |
| --- | --- |
| `app/[locale]/(pos)` | the till's screens |
| `app/panel` | the Master panel |
| `app/actions` | every mutation, as Server Actions |
| `app/api` | the menu feed, online-order ingestion, the print queue |
| `lib/pricing.ts` | all money maths, in integer cents |
| `lib/orders.ts` | building an order from the database, and its number |
| `lib/business-day.ts` | the 05:00-to-05:00 Berlin day the shop runs on |
| `lib/printing` | the slip format, and the two ways it reaches paper |
| `print/` | the agent that prints at the shop for a cloud-hosted app |

## Two rules worth knowing before editing

Every `"use server"` export is a public POST endpoint. Next.js authenticates
nobody on the way in and `proxy.ts` checks only that a cookie is *present*, so
every action opens with `requireCashier()` (the till) or a `getPanelSession()`
check returning `unauthorized` (the panel). There is no other gate.

Money is only ever integer cents, and only ever through `lib/pricing.ts` — the
same module runs in the browser for the live cart and on the server for the row
that gets written, which is what keeps the two from ever disagreeing.

## Commands

```bash
npm run dev      # development server
npm run build    # production build
npm run lint     # eslint
npm run db:seed  # reseed menu, settings and staff
npm run print    # the print agent (Windows, beside the printer)
```
