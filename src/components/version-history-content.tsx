'use client';

import { useEffect, useRef, useState } from 'react';
import {
  mountVersionHistory,
  versionHistoryHtml,
  type VersionHistoryProps,
} from '@/vanilla/version-history';

/** Temporary bridge until the version-history dialog is also vanilla. */
export function VersionHistoryContent(props: VersionHistoryProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountVersionHistory> | null>(null);
  const [initialMarkup] = useState(() => ({ __html: versionHistoryHtml(props) }));

  useEffect(() => {
    if (!host.current) return;
    const instance = mountVersionHistory(host.current, props);
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
    // The host's lifetime is independent of subsequent prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { releases, isLoading, error } = props;
  useEffect(() => {
    controller.current?.update({ releases, isLoading, error });
  }, [releases, isLoading, error]);

  return <div ref={host} className="version-history" dangerouslySetInnerHTML={initialMarkup} />;
}
