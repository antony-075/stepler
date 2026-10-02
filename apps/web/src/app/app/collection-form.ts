import {
  collectionDescriptionSchema,
  collectionTitleSchema,
  type CreateCollectionRequest,
} from '@stepler/contracts';
import { z } from 'zod';

/** The lengths the API accepts (`collectionTitleSchema`, `collectionDescriptionSchema`). */
export const TITLE_MAX = collectionTitleSchema.maxLength ?? Infinity;
export const DESCRIPTION_MAX = collectionDescriptionSchema.maxLength ?? Infinity;

/**
 * The create and settings forms. The description is a plain string here (an empty field is
 * `''`), so the inputs stay controlled; `toCollectionRequest` turns blank into `null`.
 */
export const collectionFormSchema = z.object({
  title: collectionTitleSchema,
  description: z.string().trim().max(DESCRIPTION_MAX),
});
export type CollectionFormValues = z.infer<typeof collectionFormSchema>;

export function toCollectionRequest(values: CollectionFormValues): CreateCollectionRequest {
  const description = values.description.trim();
  return { title: values.title.trim(), description: description === '' ? null : description };
}
