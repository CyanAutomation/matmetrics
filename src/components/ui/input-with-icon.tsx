import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Input } from './input';

type InputWithIconProps = ComponentProps<typeof Input> & {
  icon: ReactNode;
  wrapperClassName?: string;
};

/** A text input with a consistently aligned, non-interactive leading icon. */
export function InputWithIcon({
  icon,
  className,
  wrapperClassName,
  ...props
}: InputWithIconProps) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
      >
        {icon}
      </span>
      <Input {...props} className={cn('h-11 pl-10', className)} />
    </div>
  );
}
