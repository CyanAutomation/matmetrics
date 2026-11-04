'use client';

import { useEffect, useRef, useState } from 'react';
import {
  mountSessionHistoryFilterBar,
  sessionHistoryFilterBarHtml,
  type SessionHistoryFilterBarProps,
} from '@/vanilla/session-history-filter-bar';

/** Temporary React boundary while the history screen state is migrated. */
export function SessionHistoryFilterBar(props: SessionHistoryFilterBarProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountSessionHistoryFilterBar> | null>(null);
  const [markup] = useState(() => ({ __html: sessionHistoryFilterBarHtml(props) }));

  useEffect(() => {
    const root = host.current?.querySelector<HTMLElement>(
      '[role="region"][aria-label="Filter training history"]'
    );
    if (!root) return;
    const instance = mountSessionHistoryFilterBar(root, props);
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
    // The controller belongs to this host; subsequent props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controller.current?.update(props);
  });

  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
