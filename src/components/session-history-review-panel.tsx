'use client';

import { useEffect, useRef, useState } from 'react';
import {
  mountSessionHistoryReviewPanel,
  sessionHistoryReviewPanelHtml,
  type SessionHistoryReviewPanelProps,
} from '@/vanilla/session-history-review-panel';

/** Temporary React boundary while the training-history view is converted. */
export function SessionHistoryReviewPanel(props: SessionHistoryReviewPanelProps) {
  if (props.entries.length === 0) return null;
  return <VanillaSessionHistoryReviewPanel {...props} />;
}

function VanillaSessionHistoryReviewPanel(props: SessionHistoryReviewPanelProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountSessionHistoryReviewPanel> | null>(null);
  const [markup] = useState(() => ({
    __html: sessionHistoryReviewPanelHtml(props),
  }));

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const instance = mountSessionHistoryReviewPanel(root, props);
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
    // The controller owns this host; subsequent props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controller.current?.update(props);
  });

  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
