'use client';

import { useEffect, useRef, useState } from 'react';
import {
  linearStepProgressHtml,
  mountLinearStepProgress,
  type LinearStepProgressProps,
} from '@/vanilla/linear-step-progress';

export type { LinearStepProgressProps } from '@/vanilla/linear-step-progress';

/** Temporary React adapter around the reusable vanilla step progress primitive. */
export function LinearStepProgress(props: LinearStepProgressProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountLinearStepProgress> | null>(null);
  const [markup] = useState(() => ({ __html: linearStepProgressHtml(props) }));

  useEffect(() => {
    if (!host.current) return;
    const instance = mountLinearStepProgress(host.current, props);
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
