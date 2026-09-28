import type { ReactNode } from 'react';

import { DataSurface } from '@/components/ui/data-display';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type PluginSectionCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  children?: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  surface?: 'card' | 'data';
};

export function PluginSectionCard({
  title,
  description,
  headerActions,
  children,
  className,
  headerClassName,
  contentClassName,
  surface = 'card',
}: PluginSectionCardProps) {
  const header =
    title || description || headerActions ? (
      <CardHeader
        data-slot="plugin-section-card-header"
        className={cn(
          headerActions
            ? 'flex flex-row items-start justify-between gap-4'
            : '',
          headerClassName
        )}
      >
        {title || description ? (
          <div className="space-y-1">
            {title ? (
              <h3
                data-slot="plugin-section-card-title"
                className="text-headline-sm"
              >
                {title}
              </h3>
            ) : null}
            {description ? (
              <CardDescription data-slot="plugin-section-card-description">
                {description}
              </CardDescription>
            ) : null}
          </div>
        ) : null}
        {headerActions ? (
          <div
            data-slot="plugin-section-card-header-actions"
            className="shrink-0"
          >
            {headerActions}
          </div>
        ) : null}
      </CardHeader>
    ) : null;
  const content = (
    <CardContent
      data-slot="plugin-section-card-content"
      className={contentClassName}
    >
      {children}
    </CardContent>
  );

  if (surface === 'data') {
    return (
      <DataSurface
        data-slot="plugin-section-card"
        variant="subtle"
        padding="none"
        className={className}
      >
        {header}
        {content}
      </DataSurface>
    );
  }

  return (
    <Card data-slot="plugin-section-card" className={className}>
      {header}
      {content}
    </Card>
  );
}
