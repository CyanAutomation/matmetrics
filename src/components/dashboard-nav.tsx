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
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from '@/components/ui/sidebar';
import { MatMetricsLogo } from '@/components/matmetrics-logo';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  getGuestBadgeLabel,
  getGuestWorkspaceDescription,
} from '@/lib/dashboard-utils';
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
  const trainingTabs = visibleTabs.filter(
    (tab) => tab.id === 'dashboard' || tab.id === 'history'
  );
  const toolTabs = visibleTabs.filter(
    (tab) => tab.id !== 'dashboard' && tab.id !== 'history'
  );

  const renderTabs = (tabs: DashboardTab[]) =>
    tabs.map((tab) => {
      const Icon = tab.icon;
      const isActive = activeTab === tab.id;
      return (
        <SidebarMenuItem key={tab.id}>
          <SidebarMenuButton
            isActive={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onTabChange(tab.id)}
            className="py-6 rounded-xl data-[active=true]:bg-[hsl(var(--color-primary-fixed))] data-[active=true]:text-[hsl(var(--color-on-primary-fixed))]"
          >
            <Icon className="h-5 w-5" />
            <span className="text-base font-semibold">{tab.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

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
        <SidebarGroup className="p-0">
          <SidebarGroupLabel>Training</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {renderTabs(trainingTabs)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {toolTabs.length > 0 && (
          <SidebarGroup className="mt-4 p-0">
            <SidebarGroupLabel>Tools &amp; settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
                {renderTabs(toolTabs)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
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
