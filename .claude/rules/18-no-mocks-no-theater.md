# Reality Over Theater

Do not create fake integrations, placeholder success responses or simulated provider behavior and present them as working.

Mocks are allowed in tests when they represent a deliberate boundary.

If an external integration cannot be verified locally:
- isolate it behind an adapter;
- provide a test double only for tests;
- clearly mark unverified behavior;
- never claim it is production-ready.
