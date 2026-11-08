'use client';

import { useEffect, useRef, useState } from 'react';
import {
  mountRadioGroup,
  radioGroupHtml,
  type RadioGroupProps,
} from '@/vanilla/radio-group';

/** Temporary adapter while the parent view still owns the radio selection. */
export function VanillaRadioGroup(props: RadioGroupProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountRadioGroup> | null>(null);
  const [markup] = useState(() => ({ __html: radioGroupHtml(props) }));

  useEffect(() => {
    const group = host.current?.querySelector<HTMLElement>('[data-ui-radio-group]');
    if (!group) return;
    const instance = mountRadioGroup(group, props);
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
