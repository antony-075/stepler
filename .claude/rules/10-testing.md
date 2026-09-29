# Testing

Test behavior and contracts, not implementation details.

Use:
- unit tests for domain logic;
- integration tests for API/database boundaries;
- component tests for complex UI behavior;
- Playwright for critical user journeys.

Mock external boundaries rather than internal modules when possible.

Every important bug should gain a regression test.

Do not weaken/remove tests merely to make the suite green.
