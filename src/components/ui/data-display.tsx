import { cn } from '@/lib/utils';

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
