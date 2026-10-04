'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { GUEST_NAME_MAX_CHARS, codePointLength, guestNameSchema } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { Field } from '@stepler/ui/components/field';
import { Input } from '@stepler/ui/components/input';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@stepler/ui/components/sheet';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

/** The field as typed; the contract schema decides on submit (blank is not a name). */
const formSchema = z.object({ name: z.string() });
type NameValues = z.infer<typeof formSchema>;

type NameError = 'required' | 'tooLong' | 'invalid';

function nameError(value: string): NameError | null {
  if (value.trim() === '') return 'required';
  if (codePointLength(value.trim()) > GUEST_NAME_MAX_CHARS) return 'tooLong';
  return guestNameSchema.safeParse(value).success ? null : 'invalid';
}

/**
 * «Як вас звати?» [O4]: asked once before the guest's first contribution, with «Пропустити»;
 * later «Змінити» opens it again (`mode="edit"`, where an empty field removes the name). A bottom
 * sheet on phones, a centred dialog from 640px. `onDone` runs inside the tap that closes it, so a
 * caller can open the file picker right there (iOS requires a user gesture); the caller saves the
 * name in the background.
 */
export function NamePrompt({
  open,
  onOpenChange,
  defaultName,
  mode,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string | null;
  mode: 'first' | 'edit';
  onDone: (name: string | null) => void;
}) {
  const t = useTranslations('guest.name');
  const form = useForm<NameValues>({
    resolver: zodResolver(formSchema),
    values: { name: defaultName ?? '' },
  });
  const error = form.formState.errors.name;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader closeLabel={t('close')} className="bg-popover">
          <SheetTitle>{mode === 'first' ? t('title') : t('editTitle')}</SheetTitle>
        </SheetHeader>
        <SheetBody className="p-4 sm:p-6">
          <form
            noValidate
            className="grid gap-5"
            onSubmit={(event) =>
              void form.handleSubmit(({ name }) => {
                if (mode === 'edit' && name.trim() === '') {
                  onDone(null);
                  return;
                }
                const problem = nameError(name);
                if (problem !== null) {
                  form.setError('name', { type: problem });
                  return;
                }
                onDone(name.trim());
              })(event)
            }
          >
            <SheetDescription className="text-[0.9375rem]">{t('hint')}</SheetDescription>
            <Field
              id="guest-name"
              label={t('label')}
              error={
                error === undefined
                  ? undefined
                  : error.type === 'tooLong'
                    ? t('tooLong', { max: GUEST_NAME_MAX_CHARS })
                    : error.type === 'invalid'
                      ? t('invalid')
                      : t('required')
              }
            >
              {(control) => (
                <Input
                  {...control}
                  autoComplete="name"
                  enterKeyHint="done"
                  {...form.register('name')}
                />
              )}
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {mode === 'first' ? (
                <Button type="button" variant="ghost" onClick={() => onDone(null)}>
                  {t('skip')}
                </Button>
              ) : null}
              <Button type="submit" variant="pencil" size="lg">
                {mode === 'first' ? t('continue') : t('save')}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
