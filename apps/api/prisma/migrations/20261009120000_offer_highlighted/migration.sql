-- «Найпопулярніший» on «Тарифи» and /pricing (billing page v4); editable in /ops from M4.
ALTER TABLE "BillingOffer" ADD COLUMN "highlighted" BOOLEAN NOT NULL DEFAULT false;

UPDATE "BillingOffer" SET "highlighted" = true WHERE "code" = 'sub-business';
