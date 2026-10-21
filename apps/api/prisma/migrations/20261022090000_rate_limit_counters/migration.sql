-- Rate-limit and sign-in-failure counters shared by every API instance (launch checklist 4.4).
-- UNLOGGED: no WAL for a table written on every limited request; a crash may empty it, which
-- only resets the current windows.
CREATE UNLOGGED TABLE "RateLimitCounter" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "windowEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "blockedUntil" TIMESTAMPTZ(3),

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);
