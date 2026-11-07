'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  confirmationDialogHtml,
  mountConfirmationDialog,
  type ConfirmationDialogProps,
} from '@/vanilla/confirmation-dialog';

type VanillaConfirmationDialogProps = Omit<ConfirmationDialogProps, 'id'>;

/** Temporary React host for the reusable vanilla confirmation dialog. */
export function VanillaConfirmationDialog(props: VanillaConfirmationDialogProps) {
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountConfirmationDialog> | null>(null);
  const [markup] = useState(() => ({
    __html: confirmationDialogHtml({ ...props, id }),
  }));

  useEffect(() => {
    const dialog = host.current?.querySelector('dialog');
    if (!dialog) return;
    const instance = mountConfirmationDialog(dialog, { ...props, id });
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
    // The controller owns this host; subsequent props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    controller.current?.update({ ...props, id });
  });

  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
