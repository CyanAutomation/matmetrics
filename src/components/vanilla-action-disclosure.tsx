'use client';

import { useEffect, useRef, useState } from 'react';
import { actionDisclosureHtml, mountActionDisclosure, type ActionDisclosureProps } from '@/vanilla/action-disclosure';

/** Temporary adapter for parents still managed by React. */
export function VanillaActionDisclosure(props: ActionDisclosureProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountActionDisclosure> | null>(null);
  const [markup] = useState(() => ({ __html: actionDisclosureHtml(props) }));
  useEffect(() => {
    const element = host.current?.querySelector<HTMLDetailsElement>('details');
    if (!element) return;
    const instance = mountActionDisclosure(element, props);
    controller.current = instance;
    return () => { instance.destroy(); controller.current = null; };
    // The controller belongs to this host; subsequent props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { controller.current?.update(props); });
  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
