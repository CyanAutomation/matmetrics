import { cn } from '@/lib/utils';

interface DataSurfaceProps {
  children: React.ReactNode;
  className?: string;
}

export function DataSurface({ children, className }: DataSurfaceProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[hsl(var(--color-outline-variant)/0.34)] bg-card p-6 shadow-[0_14px_28px_-26px_hsl(var(--foreground)/0.24)]',
        className
      )}
    >
      {children}
    </div>
  );
}
