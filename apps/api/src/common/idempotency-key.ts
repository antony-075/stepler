import { idempotencyKeyHeaderSchema } from '@stepler/contracts';
import { AppError } from '../errors/app-error.js';

/** The `Idempotency-Key` header: required, one UUID per draft (texts) or per opened form. */
export function parseIdempotencyKey(value: string | undefined): string {
  const parsed = idempotencyKeyHeaderSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new AppError('VALIDATION_FAILED', 400, {
    errors: [{ path: ['Idempotency-Key'], message: 'A UUID is required' }],
  });
}
