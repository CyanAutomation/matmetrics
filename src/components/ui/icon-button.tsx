import * as React from 'react';

import { Button } from '@/components/ui/button';

type IconButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  'asChild' | 'children' | 'size' | 'aria-label'
> & {
  icon: React.ReactNode;
  label: string;
  size?: 'default' | 'compact';
};

/** A labelled, shared icon-only action button with comfortable or compact sizing. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      icon,
      label,
      size = 'default',
      type = 'button',
      variant = 'ghost',
      ...props
    },
    ref
  ) => (
    <Button
      {...props}
      ref={ref}
      aria-label={label}
      className={className}
      size={size === 'compact' ? 'icon-sm' : 'icon'}
      type={type}
      variant={variant}
    >
      {icon}
    </Button>
  )
);
IconButton.displayName = 'IconButton';

export type { IconButtonProps };
