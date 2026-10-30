'use client';

import type { ReactNode } from 'react';
import { ChevronDown, LineChart } from 'lucide-react';

export function TrainingAnalyticsDisclosure({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <details className="group mb-8 rounded-2xl bg-[hsl(var(--color-surface-container-low))] p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 marker:content-none">
        <LineChart className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block">Explore training trends</span>
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            Effort, session types, and frequently practiced techniques
          </span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-5">{children}</div>
    </details>
  );
}
