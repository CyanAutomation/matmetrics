'use client';

import { useEffect, useRef, useState } from 'react';
import { mountTextField, textFieldHtml, type TextFieldProps } from '@/vanilla/text-field';

/** Temporary adapter while forms are owned by React. The field id must stay stable. */
export function VanillaTextField(props: TextFieldProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountTextField> | null>(null);
  const [markup] = useState(() => ({ __html: textFieldHtml(props) }));

  useEffect(() => {
    if (!host.current) return;
    const instance = mountTextField(host.current, props);
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
    // The instance belongs to this host; subsequent props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { controller.current?.update(props); });
  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
