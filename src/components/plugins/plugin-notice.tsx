import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  getPluginThemeTokens,
  type PluginThemeTone,
} from '@/components/plugins/plugin-theme';
import { cn } from '@/lib/utils';

type PluginNoticeProps = {
  title: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  tone?: PluginThemeTone;
  className?: string;
};

export function PluginNotice({
  title,
  description,
  icon,
  tone = 'default',
  className,
}: PluginNoticeProps) {
  const tokens = getPluginThemeTokens(tone);

  return (
    <Alert
      className={cn(
        tokens.noticeBorder,
        tokens.noticeBg,
        tokens.noticeText,
        className
      )}
    >
      {icon}
      <AlertTitle className="font-semibold">{title}</AlertTitle>
      <AlertDescription className="text-current/90">
        {description}
      </AlertDescription>
    </Alert>
  );
}
