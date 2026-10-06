'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

type SwitchProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  onCheckedChange?: (checked: boolean) => void;
};

const Switch = React.forwardRef<
  HTMLInputElement,
  SwitchProps
>(({ className, onChange, onCheckedChange, ...props }, ref) => (
  <span className="relative inline-flex h-6 w-11 shrink-0 align-middle">
    <input
      ref={ref}
      type="checkbox"
      role="switch"
      className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      onChange={(event) => {
        onChange?.(event);
        onCheckedChange?.(event.currentTarget.checked);
      }}
      {...props}
    />
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 rounded-full border-2 border-transparent bg-input transition-colors peer-checked:bg-primary peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-50 before:absolute before:left-0 before:top-0 before:block before:h-5 before:w-5 before:rounded-full before:bg-background before:shadow-lg before:ring-0 before:transition-transform peer-checked:before:translate-x-5',
        className
      )}
    />
  </span>
));
Switch.displayName = 'Switch';

export { Switch };
