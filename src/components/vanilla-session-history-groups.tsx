'use client';

import { useEffect, useRef, useState } from 'react';
import {
  mountSessionHistoryGroups,
  sessionHistoryGroupsHtml,
  type SessionHistoryGroupsProps,
} from '@/vanilla/session-history-groups';

/** Temporary React host while the surrounding history state is migrated. */
export function VanillaSessionHistoryGroups(
  props: SessionHistoryGroupsProps
) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<
    ReturnType<typeof mountSessionHistoryGroups> | null
  >(null);
  const [markup] = useState(() => ({
    __html: sessionHistoryGroupsHtml(props),
  }));

  useEffect(() => {
    const root = host.current?.querySelector<HTMLElement>(
      '[data-ui-session-history-groups]'
    );
    if (!root) return;

    const instance = mountSessionHistoryGroups(root, props);
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
    // The controller owns this host; later props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controller.current?.update(props);
  });

  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
