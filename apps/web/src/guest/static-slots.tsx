'use client';

import type { TemplateSlots } from '@stepler/templates/react';
import { SiteFooter } from '@/components/site-footer';
import { SiteWordmark } from '@/components/site-header';
import { LanguageSwitch } from '@/i18n/language-switch';
import { GuestLegalNotice } from './legal-notice';

// The template slots that do not depend on a guest's session: the guest page and the editor's
// preview share them. Nothing here reaches a guest API.

/** The slots that do not depend on the guest's state. */
export function staticSlots(): Pick<
  TemplateSlots,
  'brand' | 'languageSwitch' | 'legalNotice' | 'footer'
> {
  return {
    brand: <SiteWordmark />,
    languageSwitch: <LanguageSwitch variant="header" />,
    legalNotice: <GuestLegalNotice className="pt-1" />,
    footer: <SiteFooter />,
  };
}
