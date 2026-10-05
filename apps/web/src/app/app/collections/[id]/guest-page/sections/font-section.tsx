'use client';

import { FONT_IDS, type FontId } from '@stepler/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@stepler/ui/components/select';
import { useTranslations } from 'next-intl';
import { fontVariables } from '@/guest/template-fonts';
import type { SectionProps } from './section-props';

/** The four families with a Reserved Font Name show the face they are based on (owner, PR K). */
const UPSTREAM: Partial<Record<FontId, true>> = {
  'playfair-display': true,
  lora: true,
  comfortaa: true,
  'pt-serif': true,
};

const face = (id: FontId) => ({ fontFamily: `var(--font-tpl-${id})` });

/**
 * «Шрифт»: the heading font [D4]. A select of the twelve families, each name in its own face; the
 * options render (and their fonts load) only while the list is open, the trigger shows the
 * current one. Body text stays in the template's face, which the summary line says.
 */
export function FontSection({ editor, def, readOnly }: SectionProps) {
  const t = useTranslations('guestPage.font');
  const heading = editor.working.settings.headingFont;
  const name = (id: FontId) => t(`names.${id}`);
  return (
    <div className="grid gap-2">
      <Select
        value={heading}
        disabled={readOnly}
        onValueChange={(value) =>
          editor.dispatch({ type: 'settings', patch: { headingFont: value as FontId } })
        }
      >
        <SelectTrigger
          aria-label={t('trigger', { name: name(heading) })}
          className={`h-auto min-h-11 w-full py-2 ${fontVariables(heading)}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_IDS.map((id) => (
            <SelectItem key={id} value={id} className={fontVariables(id)}>
              <span className="grid">
                <span className="text-base" style={face(id)}>
                  {name(id)}
                </span>
                {UPSTREAM[id] === true ? (
                  <span className="type-caption text-muted-foreground">
                    {t('basedOn', { name: t(`upstream.${id}`) })}
                  </span>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-sm">
        {heading === def.bodyFont
          ? t('same', { name: name(heading) })
          : t('summary', { heading: name(heading), body: name(def.bodyFont) })}
      </p>
      <p className="text-sm text-muted-foreground">{t('helper')}</p>
    </div>
  );
}
