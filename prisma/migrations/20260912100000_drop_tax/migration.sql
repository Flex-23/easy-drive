-- The shop prices everything at what the customer pays and shows no tax
-- anywhere: not in the cart, not on the receipt, not in Settings. The VAT that
-- used to be worked out *inside* the total never changed a single figure the
-- customer paid, so nothing is owed or refunded by dropping it — the column
-- and the rate simply go.
ALTER TABLE "Order" DROP COLUMN "taxAmount";

DELETE FROM "Setting" WHERE "key" = 'taxRate';
