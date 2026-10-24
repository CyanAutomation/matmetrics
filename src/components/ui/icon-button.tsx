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
export function IconButton({
  className,
  icon,
  label,
  size = 'default',
  type = 'button',
  variant = 'ghost',
  ...props
}: IconButtonProps) {
  return (
    <Button
      {...props}
      aria-label={label}
      className={className}
      size={size === 'compact' ? 'icon-sm' : 'icon'}
      type={type}
      variant={variant}
    >
      {icon}
    </Button>
  );
}

export type { IconButtonProps };
