import {
  codePointLength,
  NO_CONTROL_CHARACTERS,
  type UpdateCollectionRequest,
  WELCOME_MESSAGE_MAX_CHARS,
} from '@stepler/contracts';
import { z } from 'zod';

/** The longest welcome message the API accepts, in code points (an emoji is one) [A5]. */
export const WELCOME_MAX = WELCOME_MESSAGE_MAX_CHARS;
/** The counter shows from here on, so a short message is not watched by a number. */
export const WELCOME_COUNTER_FROM = 120;

/**
 * The welcome form. A plain string (an empty field is `''`, which clears the message), checked
 * like `collectionWelcomeMessageSchema`: at most 160 code points, one paragraph.
 */
export const welcomeFormSchema = z.object({
  welcomeMessage: z
    .string()
    .trim()
    .refine((value) => codePointLength(value) <= WELCOME_MAX, { message: 'tooLong' })
    .regex(NO_CONTROL_CHARACTERS, 'lineBreaks'),
});
export type WelcomeFormValues = z.infer<typeof welcomeFormSchema>;

/** Blank clears the message (`null`: guests see none). */
export function toWelcomeRequest(values: WelcomeFormValues): UpdateCollectionRequest {
  const text = values.welcomeMessage.trim();
  return { welcomeMessage: text === '' ? null : text };
}

/**
 * What typing or pasting puts in the field: line breaks, tabs and the line and paragraph
 * separators become one space each run, so a pasted two-line text stays one paragraph; the
 * other characters the API refuses (DEL, C1, bidirectional controls) are dropped.
 */
export const oneParagraph = (value: string): string =>
  value
    // eslint-disable-next-line no-control-regex -- control characters are exactly what goes
    .replace(/[\u0000-\u001f\u2028\u2029]+/g, ' ')
    .replace(/[\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '');
