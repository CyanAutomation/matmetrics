import type { ReactNode } from 'react';

import { AlertCircle } from 'lucide-react';

import { PluginNotice } from '@/components/plugins/plugin-notice';
import type { PluginThemeTone } from '@/components/plugins/plugin-theme';

type PluginAuthGateNoticeProps = {
  isAuthenticated: boolean;
  authAvailable: boolean;
  title?: ReactNode;
  signedInDescription?: ReactNode;
  signedOutDescription?: ReactNode;
  tone?: PluginThemeTone;
  className?: string;
};

export function PluginAuthGateNotice({
  isAuthenticated,
  authAvailable,
  title = 'Sign-in required',
  signedInDescription = 'Authentication is available, but this plugin requires an active session before running protected actions.',
  signedOutDescription = 'Authentication is currently unavailable. Sign in to unlock plugin actions that require secure API access.',
  tone = 'warning',
  className,
}: PluginAuthGateNoticeProps) {
  return (
    <PluginNotice
      title={title}
      description={isAuthenticated ? signedInDescription : signedOutDescription}
      tone={tone}
      className={className}
      icon={<AlertCircle className="h-4 w-4" />}
    />
  );
}
