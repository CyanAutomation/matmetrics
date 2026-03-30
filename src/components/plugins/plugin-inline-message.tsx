import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  getPluginThemeTokens,
  type PluginThemeTone,
} from '@/components/plugins/plugin-theme';
import { cn } from '@/lib/utils';

type PluginInlineMessageProps = {
  tone?: Extract<
    PluginThemeTone,
    'default' | 'info' | 'warning' | 'success' | 'error'
  >;
  title?: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function PluginInlineMessage({
  tone = 'default',
  title,
  description,
  icon,
  className,
}: PluginInlineMessageProps) {
  const tokens = getPluginThemeTokens(tone);

  return (
    <Alert className={cn(tokens.inlineMessageTone, className)}>
      {icon}
      {title ? (
        <AlertTitle className="font-semibold">{title}</AlertTitle>
      ) : null}
      <AlertDescription className="text-current/90">
        {description}
      </AlertDescription>
    </Alert>
  );
}
