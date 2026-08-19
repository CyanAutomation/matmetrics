import type { ReactNode } from 'react';

import {
  getPluginThemeTokens,
  type PluginThemeTone,
} from '@/components/plugins/plugin-theme';
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
    <section className={cn(PLUGIN_PAGE_CLASS_PATTERNS.container, className)}>
      <div
        className={cn(
          PLUGIN_PAGE_CLASS_PATTERNS.verticalSpacing,
          contentClassName
        )}
      >
        <header
          className={cn(
            'flex items-start gap-3',
            headerActions ? 'justify-between' : null
          )}
        >
          {icon ? (
            <div
              className={cn(
                'shrink-0',
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
            </div>
          ) : null}
          <div
            className={cn(
              PLUGIN_PAGE_CLASS_PATTERNS.headingHierarchy,
              'min-w-0'
            )}
          >
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {headerActions ? (
            <div className="shrink-0">{headerActions}</div>
          ) : null}
        </header>
        {notice ? <div>{notice}</div> : null}
        <div className={PLUGIN_PAGE_CLASS_PATTERNS.cardSpacing}>{children}</div>
      </div>
    </section>
  );
}
