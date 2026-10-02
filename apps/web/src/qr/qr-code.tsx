'use client';

import { useMemo } from 'react';
import { QR_DARK, QR_LIGHT, QR_QUIET_ZONE, qrMatrix, qrPath, qrViewBox } from './qr';

type QrCodeProps = {
  /** The text to encode: a guest link URL. */
  value: string;
  /** The accessible name, translated by the caller (e.g. «QR-код посилання “Гостьове посилання”»). */
  label: string;
  /** Side in px, quiet zone included. */
  size: number;
  className?: string;
};

/**
 * A QR code as inline SVG, drawn from the encoder's matrix: white square, dark modules, the
 * 4-module quiet zone inside `size`. It stays light in dark mode (DESIGN-SYSTEM.md §11.3).
 */
export function QrCode({ value, label, size, className }: QrCodeProps) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  const side = matrix.length + QR_QUIET_ZONE * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={qrViewBox(matrix.length)}
      shapeRendering="crispEdges"
      className={className}
      data-slot="qr-code"
    >
      <rect x={-QR_QUIET_ZONE} y={-QR_QUIET_ZONE} width={side} height={side} fill={QR_LIGHT} />
      <path fill={QR_DARK} d={qrPath(matrix)} />
    </svg>
  );
}
