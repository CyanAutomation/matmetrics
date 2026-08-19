import { cn } from '@/lib/utils';

interface DataSurfaceProps {
  children: React.ReactNode;
  className?: string;
}

export function DataSurface({ children, className }: DataSurfaceProps) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-card p-6 shadow-[0_18px_32px_-30px_hsl(var(--foreground)/0.32)]',
        className
      )}
    >
      {children}
    </div>
  );
}
