'use client';

import { Button } from '@stepler/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@stepler/ui/components/dropdown-menu';
import { useToast } from '@stepler/ui/components/toast';
import { ChevronDown, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { downloadQr, type QrFileFormat } from '@/qr/qr';

/**
 * «Завантажити QR ▾»: a PNG for print (2048px) or an SVG, made in the browser from the link
 * (nothing is uploaded). `fileBase` comes from `qrFileName`.
 */
export function QrDownloadMenu({
  url,
  fileBase,
  variant = 'outline',
}: {
  url: string;
  fileBase: string;
  variant?: 'default' | 'outline';
}) {
  const t = useTranslations('access');
  const { toast } = useToast();

  const save = async (format: QrFileFormat) => {
    try {
      await downloadQr(url, fileBase, format);
    } catch {
      toast({ variant: 'error', title: t('downloadFailed') });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant}>
          <Download aria-hidden="true" />
          {t('downloadQr')}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => void save('png')}>{t('downloadPng')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void save('svg')}>{t('downloadSvg')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
