-- Deleting an additional link (owner, 2026-10-02): the link is revoked and hidden from the list,
-- but the row stays for the audit trail and for guest content that will reference it.
ALTER TABLE "GuestLink" ADD COLUMN "hiddenAt" TIMESTAMPTZ(3);

-- Only a revoked additional link can be hidden; the default link is replaced, never deleted.
ALTER TABLE "GuestLink" ADD CONSTRAINT "GuestLink_hidden_only_revoked_additional"
  CHECK ("hiddenAt" IS NULL OR ("status" = 'REVOKED' AND NOT "isDefault"));
