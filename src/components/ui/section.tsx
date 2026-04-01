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

interface SectionHeaderProps {
  children: React.ReactNode;
  className?: string;
  as?: 'h2' | 'h3' | 'h4';
}

export function SectionHeader({
  children,
  className,
  as: Tag = 'h2',
}: SectionHeaderProps) {
  const sizes = {
    h2: 'text-headline-lg',
    h3: 'text-headline-md',
    h4: 'text-headline-sm',
  } as const;

  return (
    <Tag
      className={cn(
        sizes[Tag],
        'tracking-tight text-foreground',
        className
      )}
    >
      {children}
    </Tag>
  );
}

interface SectionDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionDescription({
  children,
  className,
}: SectionDescriptionProps) {
  return (
    <p className={cn('text-body-md text-muted-foreground', className)}>
      {children}
    </p>
  );
}
