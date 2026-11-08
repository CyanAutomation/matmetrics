'use client';

import { useEffect, useRef, useState } from 'react';
import {
  mountTextarea,
  textareaHtml,
  type TextareaProps,
} from '@/vanilla/textarea';

/** Temporary adapter while the parent view still owns the textarea state. */
export function VanillaTextarea(props: TextareaProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountTextarea> | null>(null);
  const [markup] = useState(() => ({ __html: textareaHtml(props) }));

  useEffect(() => {
    if (!host.current) return;
    const instance = mountTextarea(host.current, props);
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
    // The instance belongs to this host; subsequent props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controller.current?.update(props);
  });
  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
