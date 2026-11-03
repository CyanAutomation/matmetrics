'use client';

import { useEffect, useRef, useState } from 'react';
import { mountSessionDetails, sessionDetailsHtml, type SessionDetailsProps } from '@/vanilla/session-details';

/** Temporary adapter while session history remains React-owned. */
export function VanillaSessionDetails(props: SessionDetailsProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountSessionDetails> | null>(null);
  const [markup] = useState(() => ({ __html: sessionDetailsHtml(props) }));
  useEffect(() => {
    if (!host.current) return;
    const instance = mountSessionDetails(host.current, props);
    controller.current = instance;
    return () => { instance.destroy(); controller.current = null; };
    // The controller belongs to this host; subsequent props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { controller.current?.update(props); });
  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
