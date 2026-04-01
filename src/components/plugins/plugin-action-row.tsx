import type { ReactNode } from 'react';

import {
  getPluginUiTokenClassNames,
  PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP,
} from '@/components/plugins/plugin-style-policy';
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
    <div
      className={cn(
        getPluginUiTokenClassNames('layout.action-row'),
        'items-center',
        className
      )}
    >
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
    <PluginActionSlot
      className={cn(
        PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP[
          'layout.action-row.trailing'
        ],
        className
      )}
    >
      {children}
    </PluginActionSlot>
  );
}
