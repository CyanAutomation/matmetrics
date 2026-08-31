import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export const PAGE_SHELL_CLASS_PATTERNS = {
  container: 'mx-auto w-full max-w-5xl',
  content: 'space-y-6',
  heading: 'space-y-1',
};

type PageShellProps = {
  title: ReactNode;
  description: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
};

/**
 * Shared information architecture for full application pages. It keeps page
 * context in one predictable place while allowing each surface to supply its
 * own content and actions.
 */
export function PageShell({
  title,
  description,
  eyebrow,
  icon,
  actions,
  children,
  className,
  contentClassName,
  headerClassName,
}: PageShellProps) {
  return (
    <section className={cn(PAGE_SHELL_CLASS_PATTERNS.container, className)}>
      <div className={cn(PAGE_SHELL_CLASS_PATTERNS.content, contentClassName)}>
        <header
          className={cn(
            'flex flex-col items-start gap-3 sm:flex-row',
            actions ? 'justify-between' : null,
            headerClassName
          )}
        >
          {icon ? icon : null}
          <div
            className={cn(PAGE_SHELL_CLASS_PATTERNS.heading, 'min-w-0 flex-1')}
          >
            {eyebrow ? (
              <p className="text-label-md text-primary">{eyebrow}</p>
            ) : null}
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {actions ? (
            <div className="w-full shrink-0 sm:w-auto">{actions}</div>
          ) : null}
        </header>
        {children}
      </div>
    </section>
  );
}
