import type { TemplateDefinition } from '@stepler/templates/core';
import type { GuestPageEditorApi } from '../use-guest-page-editor';

/** What every panel section gets: the editor, the working copy's template, read-only (archived). */
export interface SectionProps {
  collectionId: string;
  editor: GuestPageEditorApi;
  def: TemplateDefinition;
  readOnly: boolean;
}
