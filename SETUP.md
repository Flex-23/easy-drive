# Easy Drive — Setup

Easy Drive is a bilingual (Arabic / German) restaurant point-of-sale terminal
built with Next.js (App Router), TypeScript, Prisma, MySQL and Tailwind CSS v4.

## Prerequisites

- **Node.js 20.9+** (developed on Node 24)
- **XAMPP** with MySQL (MariaDB) — the database runs on `localhost:3306`

## 1. Start XAMPP

1. Open the **XAMPP Control Panel**.
2. Start **Apache** (optional, only needed for phpMyAdmin) and **MySQL** (required).
3. Confirm MySQL is listening on port **3306**.

## 2. Create the database

Create a database named **`easy_drive`** using **`utf8mb4`** so Arabic and German
characters (Ä, Ö, Ü, ß and Arabic script) store and sort correctly.

**Option A — phpMyAdmin** (http://localhost/phpmyadmin):
- Click **New**, name it `easy_drive`, choose collation
  **`utf8mb4_unicode_ci`**, then **Create**.

**Option B — MySQL shell**:

```sql
CREATE DATABASE easy_drive
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

## 3. Configure the connection

The connection string is already written to `.env`:

```
DATABASE_URL="mysql://root@localhost:3306/easy_drive"
```

This matches the XAMPP defaults (user `root`, empty password). `.env` is
git-ignored; `.env.example` is committed as a template.

## 4. Install, migrate and seed

```bash
npm install
npx prisma migrate dev          # applies prisma/migrations against easy_drive
npx prisma db seed              # idempotent: 15 categories, 65 items, staff,
                                # ~15 customers and ~40 historical orders
```

## 5. Run

```bash
npm run dev                     # http://localhost:3000  (Turbopack)
```

Visiting `/` redirects to the stored/default locale (`/ar`) and opens directly
on the **New Order** screen. The app currently runs under a single active user
(a dedicated admin/role system will replace this later).

Screens (icon rail): **New Order**, **Fahrer** (driver dispatch board),
**Dashboard**, **Daily Report**, **Settings**. On the driver board, select a
pending delivery order, type a driver number and press **Enter** to dispatch it;
you can also flag it paid-online or cancel it.

Switch language any time with the **ع / DE** toggle in the top bar; it persists
across sessions. Theme (light / dark / system) toggles next to it.

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

# Ingest an online order (lands on the Online Orders screen)
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"type":"DELIVERY","customer":{"name":"Max","phone":"01511 2223344"},
       "address":{"street":"Teststr","houseNumber":"1","postalCode":"10115","city":"Berlin"},
       "lines":[{"itemNumber":301,"quantity":2,"choiceIds":[]}]}'
```

## Common pitfalls

- **Port 3306 already in use** — another MySQL/MariaDB service is running. Stop
  it in Services, or change XAMPP's MySQL port (and update `DATABASE_URL`).
- **MySQL not started** — Prisma will report `P1001: Can't reach database
  server`. Start MySQL in the XAMPP Control Panel.
- **A root password was set** — put it in the URL:
  `mysql://root:PASSWORD@localhost:3306/easy_drive`.
- **Garbled Arabic/German text** — the database must be `utf8mb4`
  (`utf8mb4_unicode_ci`). Recreate it with the collation above and re-run the
  migration + seed.
- **`prisma migrate` can't find `.env`** — run commands from the project root so
  Prisma picks up `./.env`.
