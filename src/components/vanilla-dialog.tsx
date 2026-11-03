'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { dialogHtml, mountDialog, type DialogProps } from '@/vanilla/dialog';

/** Temporary bridge for React-owned content during the vanilla UI migration. */
export function VanillaDialog({ open, onOpenChange, title, description, children }: DialogProps & {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountDialog> | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [markup] = useState(() => ({ __html: dialogHtml({ id, title, description }) }));

  useEffect(() => {
    const dialog = host.current?.querySelector('dialog');
    const content = dialog?.querySelector<HTMLElement>('[data-dialog-content]');
    if (!dialog || !content) return;
    const instance = mountDialog(dialog, { open, onOpenChange });
    controller.current = instance;
    setSlot(content);
    return () => {
      instance.destroy();
      controller.current = null;
    };
    // This controller is tied to the host; subsequent props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controller.current?.update({ open, onOpenChange });
  }, [open, onOpenChange]);

  useEffect(() => {
    const titleElement = host.current?.querySelector('[data-dialog-title]');
    const descriptionElement = host.current?.querySelector('[data-dialog-description]');
    if (titleElement) titleElement.textContent = title;
    if (descriptionElement) descriptionElement.textContent = description;
  }, [title, description]);

  return <><div ref={host} dangerouslySetInnerHTML={markup} />{slot && createPortal(children, slot)}</>;
}
