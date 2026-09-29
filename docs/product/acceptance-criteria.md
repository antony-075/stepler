# MVP Acceptance Criteria

## Collection

- Admin can create a collection.
- A default guest link is created.
- Collection belongs only to its owner.
- Unauthorized users cannot access it.

## Guest access

- Valid guest link opens the guest experience.
- Invalid/revoked links cannot access protected collection content.
- Guest permissions are enforced by the backend.

## Upload

- Supported files can be selected.
- Multiple files can be uploaded.
- Upload progress is visible.
- Failed files can be retried.
- Partial success is understandable.
- Oversized/unsupported files are rejected safely.
- Guest cannot obtain unrestricted storage credentials.

## Visibility

- Shared-gallery mode exposes only permitted content.
- Contribution-only mode does not expose prior content.
- Changing the setting takes effect according to documented session semantics.

## Ownership

- Admin can delete collection content.
- Guest can delete only their own content when permitted.
- A guest cannot delete another guest's content.

## Responsive

- Core guest flow works on phone, tablet and desktop.
- Admin flow works on phone, tablet and desktop.
- No critical action depends on hover.

## API

- Endpoints are documented in Swagger.
- Validation errors are predictable.
- Authorization is server-side.
- Critical endpoint behavior has automated tests.

## Reliability

- Upload failures do not corrupt application state silently.
- Duplicate requests do not create unintended duplicate state.
- Provider failures produce recoverable errors where possible.
