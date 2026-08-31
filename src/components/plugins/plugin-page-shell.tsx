import type { ReactNode } from 'react';

import {
  getPluginThemeTokens,
  type PluginThemeTone,
} from '@/components/plugins/plugin-theme';
import { PageShell } from '@/components/ui/page-shell';
import { cn } from '@/lib/utils';

export const PLUGIN_PAGE_CLASS_PATTERNS = {
  container: 'mx-auto w-full max-w-5xl py-1',
  verticalSpacing: 'space-y-6',
  headingHierarchy: 'space-y-1',
  cardSpacing: 'space-y-4',
};

type PluginPageShellProps = {
  title: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  headerActions?: ReactNode;
  notice?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  tone?: PluginThemeTone;
  iconFrame?: 'filled' | 'none';
};

export function PluginPageShell({
  title,
  description,
  icon,
  headerActions,
  notice,
  children,
  className,
  contentClassName,
  tone = 'default',
  iconFrame = 'filled',
}: PluginPageShellProps) {
  const tokens = getPluginThemeTokens(tone);

  return (
    <PageShell
      title={title}
      description={description}
      icon={
        icon ? (
          <span
            className={cn(
              'block shrink-0',
              iconFrame === 'filled'
                ? [
                    'rounded-lg p-2',
                    tokens.headerIconBg,
                    tokens.surfaceElevation,
                  ]
                : null
            )}
          >
            {icon}
          </span>
        ) : undefined
      }
      actions={headerActions}
      className={cn(PLUGIN_PAGE_CLASS_PATTERNS.container, className)}
      contentClassName={cn(
        PLUGIN_PAGE_CLASS_PATTERNS.verticalSpacing,
        contentClassName
      )}
    >
      {notice ? <div>{notice}</div> : null}
      <div className={PLUGIN_PAGE_CLASS_PATTERNS.cardSpacing}>{children}</div>
    </PageShell>
  );
}
