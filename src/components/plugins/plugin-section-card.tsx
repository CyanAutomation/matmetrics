import type { ReactNode } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type PluginSectionCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
};

export function PluginSectionCard({
  title,
  description,
  headerActions,
  children,
  className,
  headerClassName,
  contentClassName,
}: PluginSectionCardProps) {
  return (
    <Card className={className}>
      {title || description || headerActions ? (
        <CardHeader
          className={cn(
            headerActions
              ? 'flex flex-row items-start justify-between gap-4'
              : '',
            headerClassName
          )}
        >
          {title || description ? (
            <div className="space-y-1">
              {title ? <CardTitle>{title}</CardTitle> : null}
              {description ? (
                <CardDescription>{description}</CardDescription>
              ) : null}
            </div>
          ) : null}
          {headerActions ? (
            <div className="shrink-0">{headerActions}</div>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}
