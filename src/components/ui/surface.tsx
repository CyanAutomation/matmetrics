import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const surfaceVariants = cva('rounded-2xl text-card-foreground', {
  variants: {
    variant: {
      default: 'bg-card shadow-[0_18px_32px_-30px_hsl(var(--foreground)/0.32)]',
      subtle: 'bg-[hsl(var(--color-surface-container-low))]',
      elevated:
        'bg-card shadow-[0_22px_42px_-32px_hsl(var(--foreground)/0.42)]',
      interactive:
        'bg-card transition-colors hover:bg-[hsl(var(--color-surface-container-high)/0.52)] focus-within:ring-2 focus-within:ring-ring',
    },
    padding: {
      none: '',
      sm: 'p-4',
      default: 'p-5 sm:p-6',
      lg: 'p-6 sm:p-8',
    },
  },
  defaultVariants: {
    variant: 'default',
    padding: 'default',
  },
});

export interface SurfaceProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof surfaceVariants> {}

const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(surfaceVariants({ variant, padding }), className)}
      {...props}
    />
  )
);
Surface.displayName = 'Surface';

export { Surface, surfaceVariants };
