'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { mountVersionHistoryDialog, versionHistoryDialogHtml, type VersionHistoryDialogProps } from '@/vanilla/version-history-dialog';

interface VersionHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disableDialogWrapper?: boolean;
}

/** Temporary bridge while the dashboard is still React-owned. */
export function VersionHistoryModal({ open, onOpenChange, disableDialogWrapper = false }: VersionHistoryModalProps) {
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountVersionHistoryDialog> | null>(null);
  const props: VersionHistoryDialogProps = { id, open, onOpenChange, disableDialogWrapper };
  const [markup] = useState(() => ({ __html: versionHistoryDialogHtml(props) }));

  useEffect(() => {
    if (!host.current) return;
    const instance = mountVersionHistoryDialog(host.current, props);
    controller.current = instance;
    return () => { instance.destroy(); controller.current = null; };
    // The instance belongs to the host; later props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { controller.current?.update(props); });

  return <div ref={host} dangerouslySetInnerHTML={markup} />;
}
