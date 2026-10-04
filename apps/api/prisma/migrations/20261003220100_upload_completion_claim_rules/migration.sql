-- COMPLETING iff claimed.
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_claim_consistent" CHECK (
  ("status" = 'COMPLETING') = ("claimedAt" IS NOT NULL)
);

-- Open uploads (the concurrency limit and quota reservations) include those being completed.
DROP INDEX "UploadSession_active_idx";
CREATE INDEX "UploadSession_active_idx" ON "UploadSession" ("guestSessionId")
  WHERE "status" IN ('INITIATED', 'COMPLETING');
