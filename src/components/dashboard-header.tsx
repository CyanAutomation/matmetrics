'use client';

import {
  History,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { ModeToggle } from '@/components/mode-toggle';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type DashboardHeaderProps = {
  title: string;
  pageIcon: LucideIcon;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  syncStatusText: string;
  initials: string;
  displayName?: string | null;
  email?: string | null;
  guestWorkspaceLabel: string;
  hasUser: boolean;
  authAvailable: boolean;
  onLogSession: () => void;
  onOpenVersionHistory: () => void;
  onSignOut: () => void;
  onOpenAuth: () => void;
};

export function DashboardHeader({
  title,
  pageIcon: PageIcon,
  isOnline,
  isSyncing,
  pendingCount,
  syncStatusText,
  initials,
  displayName,
  email,
  guestWorkspaceLabel,
  hasUser,
  authAvailable,
  onLogSession,
  onOpenVersionHistory,
  onSignOut,
  onOpenAuth,
}: DashboardHeaderProps) {
  return (
    <header className="glass-surface min-h-16 flex items-center px-4 sm:px-6 justify-between sticky top-0 z-10 border-b border-[color:color-mix(in_srgb,var(--color-outline-variant)_0.12,transparent)]">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="h-11 w-11 md:hidden" />
        <span
          title={title}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--color-surface-container-low))] text-primary"
        >
          <PageIcon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <div className="flex items-center gap-2">
        {!isOnline && (
          <span title="Offline" className="flex items-center">
            <WifiOff className="h-4 w-4 text-[hsl(var(--color-on-warning-container))]" />
          </span>
        )}
        {isOnline && (isSyncing || pendingCount > 0) && (
          <span title={syncStatusText} className="flex items-center">
            <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--color-on-info-container))]" />
          </span>
        )}
        <Button
          className="min-h-11 min-w-11 shadow-sm"
          onClick={onLogSession}
          title="Log session"
          aria-label="Log session"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Log session</span>
        </Button>
        <ModeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Open account menu"
              className="w-11 h-11 rounded-full bg-[hsl(var(--color-primary-fixed))] flex items-center justify-center text-[hsl(var(--color-on-primary-fixed))] font-semibold text-sm cursor-pointer hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="font-semibold truncate">
                {displayName || email || 'Guest Mode'}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {email || guestWorkspaceLabel}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenVersionHistory}>
              <History className="mr-2 h-4 w-4" />
              Version History
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {hasUser ? (
              <DropdownMenuItem
                onClick={onSignOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onOpenAuth}>
                <LogIn className="mr-2 h-4 w-4" />
                {authAvailable ? 'Sign In' : 'Sign-in Info'}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
