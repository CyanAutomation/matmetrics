import { cn } from '@/lib/utils';

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  gap?: 'none' | 'sm' | 'md' | 'lg';
  bleed?: boolean;
}

export function Section({
  children,
  className,
  gap = 'md',
  bleed = false,
}: SectionProps) {
  const gapClasses = {
    none: '',
    sm: 'space-y-6 md:space-y-8',
    md: 'space-y-8 md:space-y-12 lg:space-y-16',
    lg: 'space-y-12 md:space-y-16 lg:space-y-20',
  } as const;

  return (
    <section
      className={cn(
        gapClasses[gap],
        !bleed && 'mx-auto w-full max-w-7xl px-4 md:px-8',
        bleed && 'px-0',
        className
      )}
    >
      {children}
    </section>
  );
}
