-- Pizzas and the burger menus carried a "Getränke" option group, so a drink
-- could be tacked onto the dish as an extra. The shop sells drinks as dishes of
-- their own (the "drinks" category), and the panel cannot edit extra groups, so
-- the group only got in the way of choosing a size. Remove it wherever it is;
-- its choices and translations go with it through the cascading foreign keys.
-- Orders keep their own text snapshot of anything sold this way.
DELETE FROM "OptionGroup" g
 USING "OptionGroupTranslation" t
 WHERE t."optionGroupId" = g."id"
   AND g."kind" = 'EXTRA'
   AND t."locale" = 'de'
   AND t."name" = 'Getränke';
