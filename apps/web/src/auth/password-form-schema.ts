import { newPasswordSchema } from '@stepler/contracts';
import { z } from 'zod';

/** The catalog keys the new-password fields show under them. */
export const PASSWORD_WEAK = 'register.passwordWeak';
export const CONFIRM_REQUIRED = 'register.confirmRequired';
export const CONFIRM_MISMATCH = 'password.mismatch';

/**
 * A new password and its confirmation, as the forms check them before sending (the API checks
 * the password again; the confirmation never leaves the browser). Any problem with the password
 * is shown as «not the rules yet» (`PASSWORD_WEAK`).
 */
export const NEW_PASSWORD_FIELDS = { password: newPasswordSchema, confirm: z.string() };

/** The form's `superRefine`: the confirmation is required and must match. */
export function checkConfirm(
  value: { password: string; confirm: string },
  ctx: z.RefinementCtx,
): void {
  if (value.confirm === '') {
    ctx.addIssue({ code: 'custom', path: ['confirm'], message: CONFIRM_REQUIRED });
  } else if (value.confirm !== value.password) {
    ctx.addIssue({ code: 'custom', path: ['confirm'], message: CONFIRM_MISMATCH });
  }
}
