import type { ReactNode } from 'react';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type PluginStatsGridProps = {
  children: ReactNode;
  className?: string;
};

type PluginStatCardProps = {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  className?: string;
  valueClassName?: string;
};

export function PluginStatsGrid({ children, className }: PluginStatsGridProps) {
  return (
    <div className={cn('grid gap-4 md:grid-cols-4', className)}>{children}</div>
  );
}

export function PluginStatCard({
  label,
  value,
  description,
  className,
  valueClassName,
}: PluginStatCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn('text-3xl', valueClassName)}>
          {value}
        </CardTitle>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
    </Card>
  );
}
