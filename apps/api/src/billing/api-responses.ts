import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

/** Swagger for a route behind `EntitlementGate.assertAdminCanWrite` (ADR 0018). */
export const ApiAdminReadOnlyResponse = () =>
  applyDecorators(
    ApiResponse({
      status: 403,
      description:
        'ACCOUNT_READ_ONLY: the trial or plan ended (view, download and delete only); ' +
        "COLLECTION_READ_ONLY: the collection's pack retention ended",
    }),
  );

/**
 * The guest-side 403 codes of `EntitlementGate.assertGuestCanContribute`, appended to a guest
 * route's existing 403 description (one response per status). The gallery stays readable.
 */
export const CLOSED_ERRORS =
  'COLLECTION_READ_ONLY (the collection is view-only) or COLLECTING_CLOSED (its collection window ended)';
