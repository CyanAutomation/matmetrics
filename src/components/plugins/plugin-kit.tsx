import type { ReactNode } from 'react';

import {
  PluginEmptyState,
  PluginErrorState,
} from '@/components/plugins/plugin-state';
import { PluginSectionCard } from '@/components/plugins/plugin-section-card';
import { PluginToolbar } from '@/components/plugins/plugin-toolbar';
import { cn } from '@/lib/utils';

type PluginFormSectionProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footerActions?: ReactNode;
  headerActions?: ReactNode;
  className?: string;
  contentClassName?: string;
  footerClassName?: string;
};

export function PluginFormSection({
  title,
  description,
  children,
  footerActions,
  headerActions,
  className,
  contentClassName,
  footerClassName,
}: PluginFormSectionProps) {
  return (
    <PluginSectionCard
      title={title}
      description={description}
      headerActions={headerActions}
      className={className}
      contentClassName={cn('space-y-4', contentClassName)}
    >
      {children}
      {footerActions ? (
        <PluginToolbar className={cn('pt-2', footerClassName)}>
          {footerActions}
        </PluginToolbar>
      ) : null}
    </PluginSectionCard>
  );
}

type PluginStatusPanelProps = {
  variant: 'success' | 'warning' | 'error';
  title: string;
  description: ReactNode;
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
};

export function PluginStatusPanel({
  variant,
  title,
  description,
  ctaLabel,
  onCta,
  className,
}: PluginStatusPanelProps) {
  if (variant === 'error') {
    return (
      <PluginErrorState
        title={title}
        message={description}
        retryLabel={ctaLabel}
        onRetry={onCta}
        className={className}
      />
    );
  }

  const toneClassName =
    variant === 'success'
      ? 'border-emerald-400/40 bg-emerald-500/10'
      : 'border-amber-400/40 bg-amber-500/10';

  return (
    <PluginEmptyState
      title={title}
      description={description}
      ctaLabel={ctaLabel}
      onCta={onCta}
      className={cn(toneClassName, className)}
    />
  );
}

type PluginTableSectionProps = {
  title: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  emptyTitle: string;
  emptyDescription: ReactNode;
  emptyCtaLabel?: string;
  onEmptyCta?: () => void;
  emptyIcon?: ReactNode;
  hasRows: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function PluginTableSection({
  title,
  description,
  headerActions,
  emptyTitle,
  emptyDescription,
  emptyCtaLabel,
  onEmptyCta,
  emptyIcon,
  hasRows,
  children,
  className,
  contentClassName,
}: PluginTableSectionProps) {
  return (
    <PluginSectionCard
      title={title}
      description={description}
      headerActions={headerActions}
      className={className}
      contentClassName={cn('space-y-4', contentClassName)}
    >
      {hasRows ? (
        <div className="overflow-x-auto">{children}</div>
      ) : (
        <PluginEmptyState
          title={emptyTitle}
          description={emptyDescription}
          ctaLabel={emptyCtaLabel}
          onCta={onEmptyCta}
          icon={emptyIcon}
          className="border-dashed bg-secondary/35"
        />
      )}
    </PluginSectionCard>
  );
}
