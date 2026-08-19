import type { CSSProperties, ReactNode } from 'react';

import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { cn } from '@/lib/utils';

type PluginMediaTileProps = {
  previewContent?: ReactNode;
  previewBackgroundStyle?: CSSProperties;
  title: ReactNode;
  metadata?: ReactNode;
  supportingText?: ReactNode;
  actions?: ReactNode;
  className?: string;
  previewClassName?: string;
  contentClassName?: string;
};

export function PluginMediaTile({
  previewContent,
  previewBackgroundStyle,
  title,
  metadata,
  supportingText,
  actions,
  className,
  previewClassName,
  contentClassName,
}: PluginMediaTileProps) {
  return (
    <article
      className={cn(
        'group overflow-hidden rounded-xl border bg-card shadow-sm',
        className
      )}
    >
      <div
        className={cn(
          'aspect-video rounded-b-none rounded-t-xl bg-muted p-3',
          previewClassName
        )}
      >
        <div
          className="flex h-full flex-col justify-between rounded-lg border border-dashed border-border/70 bg-cover bg-center p-3"
          style={previewBackgroundStyle}
        >
          {previewContent}
        </div>
      </div>

      <div className={cn('space-y-3 p-4', contentClassName)}>
        <div className="space-y-1">
          <p className="line-clamp-2 font-semibold">{title}</p>
          {metadata ? (
            <div
              className={cn(
                'flex flex-wrap items-center gap-2 text-xs',
                getPluginUiTokenClassNames('text.subtle')
              )}
            >
              {metadata}
            </div>
          ) : null}
          {supportingText ? (
            <p
              className={cn(
                'line-clamp-1 text-xs',
                getPluginUiTokenClassNames('text.subtle')
              )}
            >
              {supportingText}
            </p>
          ) : null}
        </div>

        {actions}
      </div>
    </article>
  );
}
