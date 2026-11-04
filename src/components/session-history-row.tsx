'use client';

import { useEffect, useRef, useState } from 'react';
import {
  mountSessionHistoryRow,
  sessionHistoryRowHtml,
  type SessionHistoryRowProps,
} from '@/vanilla/session-history-row';

export type { SessionHistoryRowProps } from '@/vanilla/session-history-row';

/** Temporary React host while the history screen and data state are migrated. */
export function SessionHistoryRow(props: SessionHistoryRowProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountSessionHistoryRow> | null>(null);
  const [markup] = useState(() => ({ __html: sessionHistoryRowHtml(props) }));

  useEffect(() => {
    if (!host.current) return;
    const instance = mountSessionHistoryRow(host.current, props);
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
