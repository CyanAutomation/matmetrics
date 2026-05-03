import type { ReactNode } from 'react';

import { PluginEmptyState } from '@/components/plugins/plugin-state';
import { PluginSectionCard } from '@/components/plugins/plugin-section-card';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { cn } from '@/lib/utils';

type PluginGallerySectionProps = {
  title: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  emptyTitle: string;
  emptyDescription: ReactNode;
  emptyCtaLabel?: string;
  onEmptyCta?: () => void;
  emptyIcon?: ReactNode;
  hasTiles: boolean;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  gridClassName?: string;
};

export function PluginGallerySection({
  title,
  description,
  headerActions,
  emptyTitle,
  emptyDescription,
  emptyCtaLabel,
  onEmptyCta,
  emptyIcon,
  hasTiles,
  children,
  className,
  contentClassName,
  gridClassName,
}: PluginGallerySectionProps) {
  return (
    <PluginSectionCard
      title={title}
      description={description}
      headerActions={headerActions}
      className={className}
      contentClassName={cn('space-y-4', contentClassName)}
    >
      {hasTiles ? (
        <div
          className={cn(
            'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
            gridClassName
          )}
        >
          {children}
        </div>
      ) : (
        <PluginEmptyState
          title={emptyTitle}
          description={emptyDescription}
          ctaLabel={emptyCtaLabel}
          onCta={onEmptyCta}
          icon={emptyIcon}
          className={cn(
            'border-dashed',
            getPluginUiTokenClassNames('tone.inline.default')
          )}
        />
      )}
    </PluginSectionCard>
  );
}
