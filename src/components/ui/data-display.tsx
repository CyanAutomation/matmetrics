import { cn } from '@/lib/utils';

interface DataStripProps {
  label: string;
  value: React.ReactNode;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function DataStrip({
  label,
  value,
  description,
  icon,
  className,
}: DataStripProps) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-4 py-4',
        'border-b border-[color:color-mix(in_srgb,var(--color-outline-variant)_0.25,transparent)]',
        className
      )}
    >
      {icon && (
        <div className="shrink-0 text-muted-foreground">{icon}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-label-md text-muted-foreground">{label}</div>
      </div>
      <div className="text-display-sm text-foreground tabular-nums">
        {value}
      </div>
      {description && (
        <div className="hidden sm:block text-body-sm text-muted-foreground">
          {description}
        </div>
      )}
    </div>
  );
}

interface DataSurfaceProps {
  children: React.ReactNode;
  className?: string;
}

export function DataSurface({ children, className }: DataSurfaceProps) {
  return (
    <div
      className={cn(
        'p-6 rounded-xl bg-[color:color-mix(in_srgb,var(--color-surface-container-low)_0.5,transparent)]',
        className
      )}
    >
      {children}
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}

export function InfoRow({
  label,
  value,
  className,
  valueClassName,
}: InfoRowProps) {
  return (
    <div className={cn('flex items-center justify-between py-2', className)}>
      <span className="text-body-sm text-muted-foreground">{label}</span>
      <span className={cn('text-body-sm font-semibold', valueClassName)}>
        {value}
      </span>
    </div>
  );
}
