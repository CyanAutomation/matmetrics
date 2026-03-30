'use client';

import React from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

type PluginStateFrameProps = {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
  tone?: 'default' | 'destructive';
  className?: string;
};

const PluginStateFrame = ({
  icon,
  title,
  description,
  actions,
  tone = 'default',
  className,
}: PluginStateFrameProps): React.ReactElement => {
  const toneClassName =
    tone === 'destructive'
      ? 'border-destructive/35 bg-destructive/5'
      : 'border-border bg-muted/30';

  return (
    <div
      className={`rounded-md border p-4 ${toneClassName} ${
        className ?? ''
      }`.trim()}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold leading-none">{title}</h3>
          <div className="text-sm text-muted-foreground">{description}</div>
          {actions ? <div className="pt-2">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
};

export const PluginLoadingState = ({
  title = 'Loading',
  description,
  className,
}: {
  title?: string;
  description: React.ReactNode;
  className?: string;
}): React.ReactElement => (
  <PluginStateFrame
    title={title}
    description={description}
    className={className}
    icon={<Loader2 className="h-4 w-4 animate-spin" />}
  />
);

export const PluginErrorState = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Retry',
  details,
  className,
  retryAriaLabel,
}: {
  title?: string;
  message: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  details?: React.ReactNode;
  className?: string;
  retryAriaLabel?: string;
}): React.ReactElement => (
  <PluginStateFrame
    title={title}
    description={
      <div className="space-y-2">
        <p>{message}</p>
        {details ? (
          <details className="text-xs">
            <summary className="cursor-pointer">Error details</summary>
            <div className="mt-1 break-words">{details}</div>
          </details>
        ) : null}
      </div>
    }
    className={className}
    tone="destructive"
    icon={<AlertCircle className="h-4 w-4 text-destructive" />}
    actions={
      onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          aria-label={retryAriaLabel}
        >
          {retryLabel}
        </Button>
      ) : null
    }
  />
);

export const PluginEmptyState = ({
  title,
  description,
  ctaLabel,
  onCta,
  className,
  icon,
}: {
  title: string;
  description: React.ReactNode;
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
  icon?: React.ReactNode;
}): React.ReactElement => (
  <PluginStateFrame
    title={title}
    description={description}
    className={className}
    icon={icon ?? <Inbox className="h-4 w-4" />}
    actions={
      ctaLabel && onCta ? (
        <Button type="button" variant="outline" onClick={onCta}>
          {ctaLabel}
        </Button>
      ) : null
    }
  />
);

export const PluginSuccessState = ({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}): React.ReactElement => (
  <PluginStateFrame
    title={title}
    description={description}
    className={className}
    icon={icon ?? <Inbox className="h-4 w-4" />}
  />
);
