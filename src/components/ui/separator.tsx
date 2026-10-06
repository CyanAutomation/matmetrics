'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

type SeparatorProps = React.HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
};

const Separator = React.forwardRef<
  HTMLDivElement,
  SeparatorProps
>(
  (
    { className, orientation = 'horizontal', decorative = true, ...props },
    ref
  ) => (
    <div
      ref={ref}
      role={decorative ? undefined : 'separator'}
      aria-hidden={decorative || undefined}
      aria-orientation={!decorative ? orientation : undefined}
      data-orientation={orientation}
      className={cn(
        'shrink-0 bg-[hsl(var(--border)/0.15)]',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className
      )}
      {...props}
    />
  )
);
Separator.displayName = 'Separator';

export { Separator };
