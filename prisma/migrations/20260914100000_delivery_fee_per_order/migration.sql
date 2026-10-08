-- The delivery fee is typed at the till for each order - it depends on where
-- the food is going - and is no longer a shop-wide setting. Orders keep the
-- fee they were charged in their own "deliveryFee" column, as before.
DELETE FROM "Setting" WHERE "key" = 'deliveryFee';
