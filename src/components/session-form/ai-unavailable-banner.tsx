'use client';

import React from 'react';

interface AiUnavailableBannerProps {
  canUseAi: boolean;
  authAvailable: boolean;
}

export function AiUnavailableBanner({
  canUseAi,
  authAvailable,
}: AiUnavailableBannerProps) {
  if (canUseAi) {
    return null;
  }

  return (
    <div className="ui-tone-warning-soft rounded-lg border px-4 py-3 text-sm">
      {authAvailable
        ? 'Guest mode can log sessions locally. Sign in to unlock AI transform and AI tag suggestion.'
        : 'Guest mode can log sessions locally. AI features are unavailable until Firebase authentication is configured.'}
    </div>
  );
}
