'use client';

import { useEffect, useRef, useState } from 'react';
import {
  guestWorkspaceNoticeHtml,
  mountGuestWorkspaceNotice,
  type GuestWorkspaceNoticeProps,
} from '@/vanilla/guest-workspace-notice';

/** Temporary bridge while the surrounding dashboard is still React. */
export function GuestWorkspaceNotice(props: GuestWorkspaceNoticeProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountGuestWorkspaceNotice> | null>(null);
  const [initialMarkup] = useState(() => ({ __html: guestWorkspaceNoticeHtml(props) }));

  useEffect(() => {
    if (!host.current) return;
    const instance = mountGuestWorkspaceNotice(host.current, props);
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
    // The instance lives as long as the host; subsequent props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { controller.current?.update(props); }, [props]);

  return <div ref={host} dangerouslySetInnerHTML={initialMarkup} />;
}
