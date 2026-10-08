-- Staff sign in with an e-mail address and a password instead of a four-digit
-- PIN. The hash column is the same scrypt `salt:hash` it always was, so every
-- existing PIN keeps working as that person's password until it is changed in
-- the Master panel — nobody is locked out by this migration.
ALTER TABLE "User" RENAME COLUMN "pin" TO "password";

-- Everyone on file gets an address to sign in with: their first name at the
-- shop's placeholder domain (`lena@easydrive.local`), the id appended where two
-- people share a first name, `user<id>` where the name yields nothing usable.
-- The panel is where these become real addresses.
ALTER TABLE "User" ADD COLUMN "email" TEXT;

UPDATE "User"
   SET "email" = COALESCE(
         NULLIF(lower(regexp_replace(split_part("name", ' ', 1), '[^A-Za-z0-9]', '', 'g')), ''),
         'user' || "id"
       ) || '@easydrive.local';

UPDATE "User" u
   SET "email" = replace(u."email", '@', u."id" || '@')
 WHERE EXISTS (
   SELECT 1 FROM "User" o WHERE o."email" = u."email" AND o."id" < u."id"
 );

ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
