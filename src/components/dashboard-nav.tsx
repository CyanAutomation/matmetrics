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
import { ChevronDown, Settings2, Sparkles } from 'lucide-react';
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
  const [systemOpen, setSystemOpen] = React.useState(false);
  const guestBadgeLabel = getGuestBadgeLabel(guestWorkspaceSource);
  const guestWorkspaceDesc = getGuestWorkspaceDescription(guestWorkspaceSource);
  const trainingTabs = visibleTabs.filter(
    (tab) => tab.id === 'dashboard' || tab.id === 'history'
  );
  const workspaceTabs = visibleTabs.filter(
    (tab) => tab.id !== 'dashboard' && tab.id !== 'history'
  );
  const workspaceTab = (title: string) =>
    workspaceTabs.filter((tab) => tab.title === title);
  const libraryTabs = [
    ...workspaceTab('Video Library'),
    ...workspaceTab('Tag Manager'),
  ];
  const preferenceTabs = workspaceTab('Prompt Settings');
  const systemTabs = workspaceTabs.filter(
    (tab) => !libraryTabs.includes(tab) && !preferenceTabs.includes(tab)
  );
  const hasActiveSystemTool = systemTabs.some((tab) => tab.id === activeTab);

  React.useEffect(() => {
    if (hasActiveSystemTool) setSystemOpen(true);
  }, [hasActiveSystemTool]);

  const renderTabs = (
    tabs: DashboardTab[],
    emphasis: 'primary' | 'secondary'
  ) =>
    tabs.map((tab) => {
      const Icon = tab.icon;
      const isActive = activeTab === tab.id;
      return (
        <SidebarMenuItem key={tab.id}>
          <SidebarMenuButton
            isActive={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onTabChange(tab.id)}
            className="min-h-11 rounded-xl data-[active=true]:bg-[hsl(var(--color-primary-fixed))] data-[active=true]:text-[hsl(var(--color-on-primary-fixed))]"
          >
            <Icon className="h-5 w-5" />
            <span
              className={
                emphasis === 'primary'
                  ? 'text-base font-semibold'
                  : 'text-sm font-medium'
              }
            >
              {tab.title}
            </span>
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
              {renderTabs(trainingTabs, 'primary')}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {workspaceTabs.length > 0 && (
          <SidebarGroup className="mt-4 p-0">
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
                {renderTabs(libraryTabs, 'secondary')}
                {renderTabs(preferenceTabs, 'secondary')}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {systemTabs.length > 0 && (
          <SidebarGroup className="mt-4 p-0">
            <SidebarGroupLabel>System</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={false}
                    onClick={() => setSystemOpen((open) => !open)}
                    aria-expanded={systemOpen}
                    aria-controls="system-navigation"
                    className="min-h-11 rounded-xl"
                  >
                    <Settings2 className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      Sync & maintenance
                    </span>
                    <ChevronDown
                      className={`ml-auto h-4 w-4 transition-transform ${systemOpen ? 'rotate-180' : ''}`}
                    />
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <div id="system-navigation">
                  {systemOpen ? renderTabs(systemTabs, 'secondary') : null}
                </div>
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
