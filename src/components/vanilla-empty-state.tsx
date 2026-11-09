'use client';

import { useEffect, useRef, useState } from 'react';
import {
  emptyStateHtml,
  mountEmptyState,
  type EmptyStateProps,
} from '@/vanilla/empty-state';

/** Temporary adapter while the parent view remains React-owned. */
export function VanillaEmptyState(props: EmptyStateProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountEmptyState> | null>(null);
  const [markup] = useState(() => ({ __html: emptyStateHtml(props) }));

  useEffect(() => {
    if (!host.current) return;
    const instance = mountEmptyState(host.current, props);
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
    // The controller belongs to this host; later props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controller.current?.update(props);
  });

  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
