# Storage & Files

Large files upload directly to R2 through short-lived signed URLs.

This is an intentional exception to the backend-only third-party integration rule.

Backend remains authoritative for:
- authorization;
- quotas;
- upload sessions;
- completion;
- metadata.

Originals are immutable.
Derived media is disposable/rebuildable.

Do not load large files into Node memory.
