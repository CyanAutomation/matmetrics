'use client';

import { useEffect, useRef, useState } from 'react';
import {
  mountTagEditor,
  tagEditorHtml,
  type TagEditorProps,
} from '@/vanilla/tag-editor';

/** Temporary adapter while the parent form still owns tag state. */
export function VanillaTagEditor(props: TagEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountTagEditor> | null>(null);
  const [markup] = useState(() => ({ __html: tagEditorHtml(props) }));

  useEffect(() => {
    const editor = host.current?.querySelector<HTMLElement>('[data-ui-tag-editor]');
    if (!editor) return;
    const instance = mountTagEditor(editor, props);
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
