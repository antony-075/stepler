# Security

Treat all client input as untrusted.

Never log:
- passwords;
- auth tokens;
- ownership tokens;
- signed URLs;
- payment secrets;
- unnecessary PII.

Server-side authorization is mandatory.

Validate file size, MIME and content signature where practical.

Rate limit public endpoints.

Verify payment webhooks.

Never use IP or browser fingerprint as proof of guest ownership.

Do not invent security controls without understanding their threat model.
