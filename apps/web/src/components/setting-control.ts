/**
 * Layout of a segmented control in a settings row: on phones it fills the row with equal
 * segments; from 600px (where the row puts it beside its label) it shrinks to its content.
 */
export const SETTING_CONTROL =
  'grid w-full auto-cols-fr grid-flow-col min-[600px]:inline-flex min-[600px]:w-fit';

/** Items centred in their segment with less padding on phones. */
export const SETTING_ITEM = 'px-2 min-[600px]:px-3.5';
