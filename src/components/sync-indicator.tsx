'use client';

import { useEffect, useRef, useState } from 'react';
import { mountSyncIndicator, syncIndicatorHtml, type SyncIndicatorProps } from '@/vanilla/sync-indicator';

/** Temporary adapter while the dashboard header is React-owned. */
export function SyncIndicator(props: SyncIndicatorProps) {
  const host = useRef<HTMLSpanElement>(null);
  const controller = useRef<ReturnType<typeof mountSyncIndicator> | null>(null);
  const [markup] = useState(() => ({ __html: syncIndicatorHtml(props) }));
  useEffect(() => {
    const element = host.current?.querySelector<HTMLElement>('[data-sync-indicator]');
    if (!element) return;
    const instance = mountSyncIndicator(element, props);
    controller.current = instance;
    return () => { instance.destroy(); controller.current = null; };
    // The instance belongs to this host; later props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { controller.current?.update(props); });
  return <span ref={host} dangerouslySetInnerHTML={markup} />;
}
