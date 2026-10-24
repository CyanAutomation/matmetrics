import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SegmentedControlContextValue = {
  value: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  variant: 'default' | 'card';
};

const SegmentedControlContext =
  React.createContext<SegmentedControlContextValue | null>(null);

type SegmentedControlProps = React.ComponentPropsWithoutRef<'div'> & {
  value: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  variant?: 'default' | 'card';
};

type SegmentedControlItemProps = Omit<
  React.ComponentPropsWithoutRef<typeof Button>,
  'aria-pressed' | 'asChild' | 'size' | 'variant' | 'value'
> & { value: string };

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
  variant = 'default',
  ...props
}: SegmentedControlProps) {
  return (
    <SegmentedControlContext.Provider
      value={{ value, onValueChange, disabled, variant }}
    >
      <div
        {...props}
        role="group"
        className={cn(
          variant === 'card'
            ? 'grid w-full gap-2'
            : 'inline-flex w-fit items-center gap-1 rounded-lg bg-secondary/55 p-1',
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
  const cardVariant = context.variant === 'card';

  return (
    <Button
      {...props}
      type="button"
      aria-pressed={selected}
      disabled={disabled ?? context.disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.onValueChange?.(value);
      }}
      size={cardVariant ? 'text' : 'chip'}
      variant={
        cardVariant ? 'outline' : selected ? 'secondary' : 'ghost'
      }
      className={cn(
        cardVariant
          ? 'h-auto w-full flex-col items-start gap-1 whitespace-normal rounded-md border p-3 text-left text-foreground shadow-none'
          : 'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
        cardVariant
          ? selected
            ? 'border-primary bg-primary/5 hover:bg-primary/10'
            : 'border-border bg-background hover:bg-muted/30'
          : selected
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        className
      )}
    >
      {children}
    </Button>
  );
}

SegmentedControl.Item = SegmentedControlItem;

export { SegmentedControl };
