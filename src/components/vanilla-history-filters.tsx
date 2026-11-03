'use client';

import { useEffect, useRef, useState } from 'react';
import { historyFiltersHtml, mountHistoryFilters, type HistoryFiltersProps } from '@/vanilla/history-filters';

/** Temporary adapter while the history view remains React-owned. */
export function VanillaHistoryFilters(props: HistoryFiltersProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountHistoryFilters> | null>(null);
  const [markup] = useState(() => ({ __html: historyFiltersHtml(props) }));
  useEffect(() => {
    const root = host.current?.querySelector<HTMLElement>('#training-history-filters');
    if (!root) return;
    const instance = mountHistoryFilters(root, props);
    controller.current = instance;
    return () => { instance.destroy(); controller.current = null; };
    // The controller belongs to this host; subsequent props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { controller.current?.update(props); });
  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
