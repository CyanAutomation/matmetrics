'use client';

import { AlertTriangle, CheckCircle2, LayoutGrid } from 'lucide-react';

import { PluginDestructiveAction } from '@/components/plugins/plugin-destructive-action';
import {
  PluginFormSection,
  PluginTableSection,
} from '@/components/plugins/plugin-kit';
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginSectionCard } from '@/components/plugins/plugin-section-card';
import {
  PluginEmptyState,
  PluginErrorState,
  PluginLoadingState,
  PluginSuccessState,
} from '@/components/plugins/plugin-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const pluginIds = ['tag-manager', 'github-sync', 'prompt-settings'];

export function PluginVisualHarness() {
  return (
    <div className="space-y-8 py-8">
      <section className="space-y-4" aria-label="Plugin shell baseline">
        <h1 className="text-2xl font-semibold">Plugin shell baseline</h1>
        <PluginPageShell
          title="Plugin visual harness"
          description="Baseline shell for plugin pages and extension tabs"
          icon={<LayoutGrid className="h-5 w-5" aria-hidden="true" />}
        >
          <PluginSectionCard
            title="Header and shell treatment"
            description="Reference spacing and elevation for plugin pages"
          >
            <p className="text-sm text-muted-foreground">
              This card is used as the baseline target for shell-level visual
              regression tests.
            </p>
          </PluginSectionCard>
        </PluginPageShell>
      </section>

      <section className="space-y-4" aria-label="Standard plugin states">
        <h2 className="text-xl font-semibold">Standard plugin states</h2>
        <p className="text-sm text-muted-foreground">
          Each plugin is rendered in loading, error, empty, success, and
          populated states.
        </p>
        <div className="space-y-6">
          {pluginIds.map((pluginId) => (
            <PluginSectionCard
              key={pluginId}
              title={pluginId}
              description="Canonical state coverage"
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <PluginLoadingState
                  title="Loading"
                  description="Fetching latest plugin data"
                />
                <PluginErrorState
                  title="Unable to load plugin"
                  message="The plugin service timed out while resolving data."
                  retryLabel="Retry"
                  onRetry={() => undefined}
                />
                <PluginEmptyState
                  title="No records yet"
                  description="Create your first record to populate this plugin."
                  ctaLabel="Create"
                  onCta={() => undefined}
                />
                <PluginSuccessState
                  title="Sync completed"
                  description="All records are in sync with the upstream source."
                  icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                />
                <PluginSectionCard
                  title="Populated"
                  description="Two sample rows"
                  className="md:col-span-2 xl:col-span-1"
                >
                  <ul className="space-y-2 text-sm">
                    <li className="rounded border p-2">Primary item</li>
                    <li className="rounded border p-2">Secondary item</li>
                  </ul>
                </PluginSectionCard>
              </div>
            </PluginSectionCard>
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-label="Shared primitives baseline">
        <h2 className="text-xl font-semibold">Shared primitives baseline</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <PluginFormSection
            title="Form section"
            description="Baseline form layout"
            footerActions={<Button size="sm">Save</Button>}
          >
            <div className="space-y-2">
              <Label htmlFor="visual-name">Name</Label>
              <Input id="visual-name" defaultValue="Plugin primitive" />
            </div>
          </PluginFormSection>

          <PluginTableSection
            title="Table section"
            description="Baseline table card + row spacing"
            emptyTitle="No rows"
            emptyDescription="Rows appear here once data is available."
            hasRows
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Record A</TableCell>
                  <TableCell>Healthy</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Record B</TableCell>
                  <TableCell>Warning</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </PluginTableSection>
        </div>
      </section>

      <section className="space-y-4" aria-label="Destructive flow baseline">
        <h2 className="text-xl font-semibold">Destructive confirmation flow</h2>
        <PluginDestructiveAction
          open
          onOpenChange={() => undefined}
          title="Delete plugin data"
          description="This action removes synchronized records and cannot be undone."
          onConfirm={() => undefined}
          confirmLabel="Delete"
          cancelLabel="Keep data"
        >
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <p>
                Confirming this action will remove cached plugin records from
                your workspace.
              </p>
            </div>
          </div>
        </PluginDestructiveAction>
      </section>
    </div>
  );
}
