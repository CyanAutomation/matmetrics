import * as React from 'react';

import { cn } from '@/lib/utils';

type SegmentedControlContextValue = {
  value: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
};

const SegmentedControlContext =
  React.createContext<SegmentedControlContextValue | null>(null);

type SegmentedControlProps = React.ComponentPropsWithoutRef<'div'> & {
  value: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
};

type SegmentedControlItemProps = React.ComponentPropsWithoutRef<'button'> & {
  value: string;
};

/**
 * A compact, single-select control for switching between peer views or scopes.
 * Use FilterChip for additive filters and this control for mutually exclusive options.
 */
function SegmentedControl({
  children,
  className,
  value,
  onValueChange,
  disabled,
  ...props
}: SegmentedControlProps) {
  return (
    <SegmentedControlContext.Provider
      value={{ value, onValueChange, disabled }}
    >
      <div
        {...props}
        role="group"
        className={cn(
          'inline-flex w-fit items-center gap-1 rounded-lg bg-secondary/55 p-1',
          className
        )}
      >
        {children}
      </div>
    </SegmentedControlContext.Provider>
  );
}

function SegmentedControlItem({
  children,
  className,
  disabled,
  onClick,
  value,
  ...props
}: SegmentedControlItemProps) {
  const context = React.useContext(SegmentedControlContext);

  if (!context) {
    throw new Error(
      'SegmentedControl.Item must be used within SegmentedControl.'
    );
  }

  const selected = context.value === value;

  return (
    <button
      {...props}
      type="button"
      aria-pressed={selected}
      disabled={disabled ?? context.disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.onValueChange?.(value);
      }}
      className={cn(
        'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  );
}

SegmentedControl.Item = SegmentedControlItem;

export { SegmentedControl };
