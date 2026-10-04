'use client';

import { type ImgHTMLAttributes, useState } from 'react';

/**
 * A presigned media image (thumbnail, preview). Links are signed for a window and stay valid at
 * least an hour after they were handed out (spec §10.6); a list left open longer can hold dead
 * links, so the first load error asks the owner of the link for a fresh one (`onExpired`), once
 * per link.
 */
export function MediaImg({
  src,
  onExpired,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  src: string;
  onExpired: () => void;
}) {
  const [retried, setRetried] = useState<string | null>(null);
  return (
    // A presigned storage URL: nothing for next/image to optimise.
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      {...props}
      src={src}
      onError={() => {
        if (retried === src) return;
        setRetried(src);
        onExpired();
      }}
    />
  );
}
