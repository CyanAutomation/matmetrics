import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PluginActionRowProps = {
  children: ReactNode;
  className?: string;
};

type PluginActionSlotProps = {
  children: ReactNode;
  className?: string;
};

function PluginActionSlot({ children, className }: PluginActionSlotProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>{children}</div>
  );
}

export function PluginActionRow({ children, className }: PluginActionRowProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}

export function PluginActionPrimary({
  children,
  className,
}: PluginActionSlotProps) {
  return <PluginActionSlot className={className}>{children}</PluginActionSlot>;
}

export function PluginActionSecondary({
  children,
  className,
}: PluginActionSlotProps) {
  return <PluginActionSlot className={className}>{children}</PluginActionSlot>;
}

export function PluginActionDestructive({
  children,
  className,
}: PluginActionSlotProps) {
  return <PluginActionSlot className={className}>{children}</PluginActionSlot>;
}

export function PluginActionTrailing({
  children,
  className,
}: PluginActionSlotProps) {
  return (
    <PluginActionSlot className={cn('ml-auto', className)}>
      {children}
    </PluginActionSlot>
  );
}
