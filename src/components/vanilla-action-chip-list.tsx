'use client';

import { useEffect, useRef, useState } from 'react';
import { actionChipListHtml, mountActionChipList, type ActionChipListProps } from '@/vanilla/action-chip-list';

/** Temporary adapter while the containing view remains React-owned. */
export function VanillaActionChipList(props: ActionChipListProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountActionChipList> | null>(null);
  const [markup] = useState(() => ({ __html: actionChipListHtml(props) }));
  useEffect(() => {
    const root = host.current?.firstElementChild as HTMLElement | null;
    if (!root) return;
    const instance = mountActionChipList(root, props);
    controller.current = instance;
    return () => { instance.destroy(); controller.current = null; };
    // The controller belongs to this host; subsequent props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { controller.current?.update(props); });
  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
