import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-none ring-1 ring-[hsl(var(--color-outline-variant)/0.12)] dark:ring-white/10 [[data-contrast='high']_&]:ring-[hsl(var(--color-outline-variant)/0.9)] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          'bg-[hsl(var(--color-primary-fixed))] text-[hsl(var(--color-on-primary-fixed))] hover:bg-[hsl(var(--color-primary-fixed)/0.9)] ring-transparent',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 ring-transparent',
        destructive:
          'bg-[hsl(var(--color-error-container))] text-[hsl(var(--color-on-error-container))] hover:bg-[hsl(var(--color-error-container)/0.9)] ring-transparent',
        outline: 'bg-card text-foreground',
        technical:
          'bg-[hsl(var(--color-info-container))] text-[hsl(var(--color-on-info-container))] ring-transparent',
        randori:
          'bg-[hsl(var(--color-secondary-container))] text-[hsl(var(--color-on-secondary-container))] ring-transparent',
        shiai:
          'bg-[hsl(var(--color-primary-fixed)/0.18)] text-primary ring-transparent',
        effortEasy:
          'bg-[hsl(var(--color-surface-container-high))] text-muted-foreground ring-transparent',
        effortLight:
          'bg-[hsl(var(--color-info-container))] text-[hsl(var(--color-on-info-container))] ring-transparent',
        effortNormal:
          'bg-[hsl(var(--color-secondary-container))] text-[hsl(var(--color-on-secondary-container))] ring-transparent',
        effortHard:
          'bg-[hsl(var(--color-warning-container))] text-[hsl(var(--color-on-warning-container))] ring-transparent',
        effortIntense:
          'bg-[hsl(var(--color-error-container))] text-[hsl(var(--color-on-error-container))] ring-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge };
