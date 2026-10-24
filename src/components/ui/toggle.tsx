import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ButtonProps = React.ComponentProps<typeof Button>;

type ToggleProps = Omit<
  ButtonProps,
  'aria-pressed' | 'asChild' | 'variant'
> & {
  pressed: boolean;
  onPressedChange?: (pressed: boolean) => void;
  pressedVariant?: ButtonProps['variant'];
  unpressedVariant?: ButtonProps['variant'];
};

/** A controlled toggle with consistent pressed semantics and Button styling. */
export function Toggle({
  children,
  className,
  onClick,
  onPressedChange,
  pressed,
  pressedVariant = 'secondary',
  type = 'button',
  unpressedVariant = 'ghost',
  ...props
}: ToggleProps) {
  return (
    <Button
      {...props}
      aria-pressed={pressed}
      className={cn(
        'transition-colors',
        !pressed && 'text-muted-foreground hover:text-foreground',
        className
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onPressedChange?.(!pressed);
      }}
      size={props.size ?? 'chip'}
      type={type}
      variant={pressed ? pressedVariant : unpressedVariant}
    >
      {children}
    </Button>
  );
}

export type { ToggleProps };
