'use client';

import { useEffect, useRef, useState } from 'react';
import { mountSegmentedControl, segmentedControlHtml, type SegmentedControlProps } from '@/vanilla/segmented-control';

/** Temporary adapter while the parent view is owned by React.
 * The controller owns the host's descendants after mount; callers must not
 * replace that markup. A React remount creates a new controller for the new host.
 */
export function VanillaSegmentedControl({ className, ...props }: SegmentedControlProps & { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountSegmentedControl> | null>(null);
  const [markup] = useState(() => ({ __html: segmentedControlHtml(props) }));
  useEffect(() => {
    const element = host.current?.querySelector<HTMLElement>('.ui-segmented-control');
    if (!element) return;
    const instance = mountSegmentedControl(element, props);
    controller.current = instance;
    return () => { instance.destroy(); controller.current = null; };
    // The instance belongs to this host; later props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { controller.current?.update(props); });
  return <div ref={host} className={className} dangerouslySetInnerHTML={markup} />;
}
