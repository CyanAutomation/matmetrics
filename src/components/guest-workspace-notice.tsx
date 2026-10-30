'use client';

import { LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GuestWorkspaceNoticeProps {
  workspaceLabel: string;
  message: string;
  signInButtonText: string;
  onSignIn: () => void;
}

export function GuestWorkspaceNotice({
  workspaceLabel,
  message,
  signInButtonText,
  onSignIn,
}: GuestWorkspaceNoticeProps) {
  return (
    <section
      role="status"
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl border border-[hsl(var(--color-outline-variant)/0.15)] bg-[hsl(var(--color-primary-fixed)/0.45)] p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-4 sm:py-3"
    >
      <LockKeyhole
        className="row-start-1 h-4 w-4 text-[hsl(var(--color-on-primary-fixed))]"
        aria-hidden="true"
      />
      <div className="col-start-2 row-start-1 min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold">Guest access is active</p>
          <span className="rounded border border-current px-2 py-0.5 text-xs">
            {workspaceLabel}
          </span>
        </div>
        <details className="group mt-1">
          <summary className="w-fit cursor-pointer text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            About this workspace
          </summary>
          <p className="mt-2 max-w-3xl text-sm">{message}</p>
        </details>
      </div>
      <Button
        size="sm"
        onClick={onSignIn}
        variant="outline"
        className="col-start-2 row-start-2 justify-self-start sm:col-start-3 sm:row-start-1 sm:justify-self-end"
      >
        {signInButtonText}
      </Button>
    </section>
  );
}
