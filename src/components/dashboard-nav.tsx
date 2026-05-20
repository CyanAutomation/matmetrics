'use client';

import React from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { MatMetricsLogo } from '@/components/matmetrics-logo';
import { Sparkles, Badge as BadgeIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getGuestBadgeLabel, getGuestWorkspaceDescription } from '@/lib/dashboard-utils';
import type { DashboardTab } from '@/lib/navigation/tab-definitions';

interface DashboardNavProps {
  activeTab: string;
  visibleTabs: DashboardTab[];
  onTabChange: (tabId: string) => void;
  isGuest: boolean;
  guestWorkspaceSource: 'custom' | 'demo';
}

/**
 * DashboardNav: Reusable sidebar navigation component for the dashboard
 * Renders the MatMetrics logo, tab navigation, and guest workspace indicator
 */
export function DashboardNav({
  activeTab,
  visibleTabs,
  onTabChange,
  isGuest,
  guestWorkspaceSource,
}: DashboardNavProps) {
  const guestBadgeLabel = getGuestBadgeLabel(guestWorkspaceSource);
  const guestWorkspaceDesc = getGuestWorkspaceDescription(guestWorkspaceSource);

  return (
    <Sidebar className="glass-surface bg-sidebar/90 shadow-[inset_-1px_0_0_hsl(var(--sidebar-border)/0.12)] [[data-contrast='high']_&]:shadow-[inset_-1px_0_0_hsl(var(--color-outline-variant)/0.92)]">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <MatMetricsLogo size="md" variant="solid" />
          <div>
            <div className="text-display-sm font-black text-primary">
              MatMetrics
            </div>
            {isGuest && (
              <Badge variant="outline" className="mt-1 border-primary/20">
                {guestBadgeLabel}
              </Badge>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarMenu className="gap-2">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <SidebarMenuItem key={tab.id}>
                <SidebarMenuButton
                  isActive={activeTab === tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className="py-6 rounded-xl data-[active=true]:bg-[hsl(var(--color-primary-fixed))] data-[active=true]:text-[hsl(var(--color-on-primary-fixed))]"
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-base font-semibold">
                    {tab.title}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {isGuest && (
        <SidebarFooter className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium px-2 py-1.5 rounded-xl bg-[hsl(var(--color-surface-container-low))]">
            <Sparkles className="h-3 w-3 text-[hsl(var(--color-on-primary-fixed))]" />
            <span className="text-[hsl(var(--color-on-primary-fixed))]">
              {guestWorkspaceDesc}
            </span>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
