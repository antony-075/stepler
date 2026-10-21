-- The ribbon's words on a highlighted offer (launch checklist 1.11); NULL keeps the default.
ALTER TABLE "BillingOffer" ADD COLUMN "ribbonUk" TEXT, ADD COLUMN "ribbonEn" TEXT;

ALTER TABLE "BillingOffer" ADD CONSTRAINT "BillingOffer_ribbon_length" CHECK (
  ("ribbonUk" IS NULL OR char_length("ribbonUk") BETWEEN 1 AND 40)
  AND ("ribbonEn" IS NULL OR char_length("ribbonEn") BETWEEN 1 AND 40)
);
