'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ChangeEntry {
  title: string;
  date: string;
  sections: {
    label: string;
    items: string[];
  }[];
}

const CHANGELOG_ENTRIES: ChangeEntry[] = [
  {
    title: 'v1.2.0',
    date: '2026-03-30',
    sections: [
      {
        label: 'Features',
        items: [
          'Version history modal for displaying recent changelog entries',
          'Enhanced session filtering and search capabilities',
          'Improved dashboard overview with real-time updates',
        ],
      },
      {
        label: 'Fixes',
        items: [
          'Fixed modal dialog responsiveness on mobile devices',
          'Corrected sidebar footer alignment issues',
          'Improved error handling for session storage',
        ],
      },
      {
        label: 'Documentation',
        items: [
          'Added comprehensive API documentation for session management',
          'Updated plugin development guide with new examples',
        ],
      },
    ],
  },
  {
    title: 'v1.1.0',
    date: '2026-01-15',
    sections: [
      {
        label: 'Features',
        items: [
          'Plugin system with dashboard tab extensions',
          'Guest mode for demo data and local sessions',
          'Session audit/log-doctor feature for data validation',
          'Dark mode support with system theme detection',
        ],
      },
      {
        label: 'Improvements',
        items: [
          'Optimized session loading performance',
          'Enhanced Tailwind CSS configuration for better responsive design',
          'Improved accessibility for dialog and form components',
        ],
      },
      {
        label: 'Fixes',
        items: [
          'Fixed session date picker behavior',
          'Corrected sidebar menu navigation state management',
          'Resolved GitHub sync token validation issues',
        ],
      },
    ],
  },
  {
    title: 'v1.0.0',
    date: '2025-10-01',
    sections: [
      {
        label: 'Features',
        items: [
          'Core session logging with date, techniques, effort rating (1-5), and category',
          'Session history view with filtering by date range',
          'Dashboard overview showing recent sessions and metrics',
          'Session export to GitHub markdown files',
          'Authentication system with Firebase',
          'Light and dark theme support',
          'Responsive design for mobile and desktop',
        ],
      },
      {
        label: 'Fixes',
        items: [
          'Fixed initial data loading on cold start',
          'Corrected browser storage persistence for sessions',
          'Resolved CSS class conflicts in Tailwind configuration',
        ],
      },
    ],
  },
];

interface VersionHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  open,
  onOpenChange,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-96">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>
            Recent changes across the three most recent versions
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto pr-4 space-y-6">
          {CHANGELOG_ENTRIES.map((entry) => (
            <div key={entry.title}>
              <div className="mb-3">
                <h3 className="font-semibold text-sm">{entry.title}</h3>
                <p className="text-xs text-muted-foreground">{entry.date}</p>
              </div>
              <div className="space-y-3">
                {entry.sections.map((section) => (
                  <div key={section.label}>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                      {section.label}
                    </h4>
                    <ul className="space-y-1 ml-3">
                      {section.items.map((item, idx) => (
                        <li key={idx} className="text-xs leading-relaxed">
                          <span className="inline-block w-1 h-1 bg-muted-foreground rounded-full mr-2 align-middle"></span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface VersionHistoryButtonProps {
  onClick: () => void;
}

export const VersionHistoryButton: React.FC<VersionHistoryButtonProps> = ({
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      title="View version history"
      aria-label="View version history"
    >
      <Info className="h-3 w-3" />
      <span className="text-xs font-medium">v1.2.0 Stable</span>
    </button>
  );
};
