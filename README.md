# Food Express

I built this to run a small restaurant that both serves walk-ins and sends out
deliveries, so it has two sides that share one database.

The first side is the till. A cashier takes an order, can park it and pick it
back up later, hands it to a driver when it's ready, settles it, and closes out
the day. It's in German because that's the language the counter staff use, and
there's no language switcher to get in the way.

The second side is a panel for the owner. It has its own login and its own
session, and from there you manage the menu, the staff, and look at the day's
sales. That part is in Arabic.

## What it does

- Take and edit orders at the counter, with sizes and hand-priced extras
- Park an order and recall it later from the board
- Assign orders to drivers and keep pickups and deliveries separate
- Print receipts on a thermal printer, whether the app runs on the shop
  machine or in the cloud
- Random, human-readable order numbers so two orders never get confused
- An owner panel for the menu, staff accounts, and daily sales
- A business day that runs 5am to 5am, so late-night orders land on the right day

## How money and auth work

All prices are kept as integer cents and go through a single pricing module, so
the cart in the browser and the row saved on the server can never disagree.
Every server action checks the session before it does anything. There's no
other gate, so that check matters.

## Built with

- Next.js (App Router) and React
- PostgreSQL through Prisma
- Tailwind for the styling
- A small standalone print agent for shops where the app runs in the cloud

## Running it locally

```bash
cp .env.example .env    # fill in your database URLs
npm install
npx prisma migrate deploy
npm run db:seed         # seeds the menu, settings, and the first admin login
npm run dev
```

There's a longer SETUP.md with the deployment details and how printing is
wired up. Read that before you put it anywhere real.

## Commands

```bash
npm run dev      # dev server
npm run build    # production build
npm run lint     # eslint
npm run db:seed  # reseed menu, settings and staff
npm run print    # the print agent, runs on the shop machine
```
