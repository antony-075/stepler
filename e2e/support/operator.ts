import { expect, type Page, type TestInfo } from '@playwright/test';
import { signIn } from './auth.js';

/**
 * The operator's service accounts in e2e (slice 9): one per Playwright parallel slot, so two
 * workers never race for the same single-use sign-in link. `moderation@stepler.test` gets every
 * «нова скарга» mail as well. All are in `OPERATOR_EMAILS` of the e2e API and worker.
 */
export const OPERATOR_SLOTS = 16;
export const OPERATOR_INBOX = 'moderation@stepler.test';
export const OPERATOR_EMAILS = [
  OPERATOR_INBOX,
  ...Array.from({ length: OPERATOR_SLOTS }, (_, i) => `moderation-${i}@stepler.test`),
].join(',');

export const operatorEmail = (testInfo: TestInfo): string =>
  `moderation-${testInfo.parallelIndex % OPERATOR_SLOTS}@stepler.test`;

/** Signs in as this slot's operator account (the user app first, as everyone), then opens /ops. */
export async function signInAsOperator(page: Page, testInfo: TestInfo): Promise<string> {
  const email = operatorEmail(testInfo);
  await signIn(page, email);
  await page.goto('/ops');
  await expect(page).toHaveURL(/\/ops\/reports/);
  return email;
}

export const OPS_UK = {
  title: 'Stepler · Модерація',
};
