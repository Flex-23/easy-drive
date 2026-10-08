-- AlterTable
ALTER TABLE "Order" ADD COLUMN "daySequence" INTEGER NOT NULL DEFAULT 0;

-- Order numbers used to carry the day's tally in their middle three digits
-- (`KX042ZR` was the 42nd order of that day). They are drawn at random now, so
-- the tally moves into its own column — but the orders already on the books
-- still have it in their number, and the kitchen copy of an old order should
-- keep reprinting the number it was called by.
UPDATE "Order"
   SET "daySequence" = COALESCE(
         (regexp_match("orderNumber", '^[A-Z]{2}([0-9]+)[A-Z]{2}$'))[1]::int,
         0
       )
 WHERE "orderNumber" ~ '^[A-Z]{2}[0-9]+[A-Z]{2}$';
