'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  dataUseNoticeHtml,
  mountDataUseNotice,
  type DataUseNoticeProps,
  type DataUseNoticeVariant,
} from '@/vanilla/data-use-notice';

export type { DataUseNoticeVariant };

export function DataUseNotice({
  variant,
  className,
}: DataUseNoticeProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountDataUseNotice> | null>(null);
  const mergedClassName = cn('text-xs text-muted-foreground', className);
  const [markup] = useState(() => ({
    __html: dataUseNoticeHtml({ variant, className: mergedClassName }),
  }));

  useEffect(() => {
    const notice = host.current?.querySelector<HTMLElement>(
      '[data-slot="data-use-notice"]'
    );
    if (!notice) return;
    const instance = mountDataUseNotice(notice, {
      variant,
      className: mergedClassName,
    });
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
    // The controller belongs to this host; subsequent props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controller.current?.update({ variant, className: mergedClassName });
  }, [variant, mergedClassName]);

  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
