-- CreateTable
CREATE TABLE "OrderCounter" (
    "day" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderCounter_pkey" PRIMARY KEY ("day")
);

-- Carry the numbers already handed out into the counter, so the first order
-- after this migration continues the day instead of restarting at 001 on top of
-- an existing number.
--
-- The business day is 05:00 Berlin to 05:00 Berlin (lib/business-day.ts), and
-- "createdAt" is a naive column holding UTC — hence the two conversions. The
-- day's highest sequence is read back out of the order numbers themselves
-- (`KX042ZR` -> 42) rather than counted, because a recalled or deleted bill
-- would make a count too low, which is the very failure this table exists to
-- prevent.
INSERT INTO "OrderCounter" ("day", "last")
SELECT day, MAX(seq)
FROM (
    SELECT
        to_char(
            ((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin')
                - INTERVAL '5 hours')::date,
            'YYYY-MM-DD'
        ) AS day,
        COALESCE(
            (regexp_match("orderNumber", '^[A-Z]{2}([0-9]+)[A-Z]{2}$'))[1]::int,
            0
        ) AS seq
    FROM "Order"
) AS numbered
GROUP BY day
ON CONFLICT ("day") DO NOTHING;
