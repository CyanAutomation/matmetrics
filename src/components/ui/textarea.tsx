import * as React from 'react';

import { FIELD_INTERACTION_CLASS } from '@/lib/interaction';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md bg-card px-3 py-2 text-base shadow-sm ring-1 ring-black/10 dark:ring-white/10 [[data-contrast='high']_&]:ring-[hsl(var(--color-outline-variant)/0.9)] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        FIELD_INTERACTION_CLASS,
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
