'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { getLocalPluginManifestCandidates } from '@/lib/plugins/registry';
import { isManifestLike, validatePluginManifest } from '@/lib/plugins/validate';
import type {
  PluginManifest,
  PluginManifestValidationResult,
  PluginValidationSeverity,
} from '@/lib/plugins/types';

type PluginCandidateEntry = {
  key: string;
  source: unknown;
  result: PluginManifestValidationResult;
};

type CreateFormState = {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
};

type UpdateFormState = {
  pluginId: string;
  patchJson: string;
  preserveExisting: boolean;
};

const kebabCasePluginIdRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const severityOrder: Record<PluginValidationSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

const severityLabel = (severity: PluginValidationSeverity): string => {
  switch (severity) {
    case 'error':
      return 'Error';
    case 'warning':
      return 'Warning';
    case 'info':
      return 'Info';
  }
};

const severityBadgeClass: Record<PluginValidationSeverity, string> = {
  error: 'bg-destructive/10 text-destructive border-destructive/20',
  warning: 'bg-amber-500/10 text-amber-700 border-amber-300',
  info: 'bg-primary/10 text-primary border-primary/30',
};

const defaultCreateFormState: CreateFormState = {
  id: '',
  name: '',
  version: '0.1.0',
  description: '',
  enabled: true,
};

const resolveEntrySummarySeverity = (
  issues: PluginManifestValidationResult['issues']
): PluginValidationSeverity => {
  if (issues.some((issue) => issue.severity === 'error')) {
    return 'error';
  }

  if (issues.some((issue) => issue.severity === 'warning')) {
    return 'warning';
  }

  return 'info';
};

const resolveOverallSeverity = (
  entries: PluginCandidateEntry[]
): PluginValidationSeverity => {
  const allIssues = entries.flatMap((entry) => entry.result.issues);

  if (allIssues.some((issue) => issue.severity === 'error')) {
    return 'error';
  }

  if (allIssues.some((issue) => issue.severity === 'warning')) {
    return 'warning';
  }

  return 'info';
};

const getManifestListFields = (
  source: unknown,
  result: PluginManifestValidationResult
): Pick<PluginManifest, 'id' | 'version' | 'enabled'> & {
  extensionCount: number;
} => {
  if (result.isValid) {
    return {
      id: result.manifest.id,
      version: result.manifest.version,
      enabled: result.manifest.enabled,
      extensionCount: result.manifest.uiExtensions.length,
    };
  }

  if (isManifestLike(source)) {
    return {
      id: typeof source.id === 'string' ? source.id : '—',
      version: typeof source.version === 'string' ? source.version : '—',
      enabled: typeof source.enabled === 'boolean' ? source.enabled : false,
      extensionCount: Array.isArray(source.uiExtensions)
        ? source.uiExtensions.length
        : 0,
    };
  }

  return {
    id: '—',
    version: '—',
    enabled: false,
    extensionCount: 0,
  };
};

const parsePatchJson = (
  patchJson: string
): { parsed: Record<string, unknown> | null; error: string | null } => {
  if (patchJson.trim().length === 0) {
    return {
      parsed: null,
      error: 'Enter a JSON object to patch an existing plugin manifest.',
    };
  }

  try {
    const parsed = JSON.parse(patchJson) as unknown;
    if (!isManifestLike(parsed)) {
      return {
        parsed: null,
        error: 'Patch payload must be a JSON object.',
      };
    }

    return { parsed, error: null };
  } catch {
    return {
      parsed: null,
      error: 'Patch payload must be valid JSON.',
    };
  }
};

export function PluginManager() {
  const candidateEntries = React.useMemo<PluginCandidateEntry[]>(
    () =>
      getLocalPluginManifestCandidates().map((source, index) => ({
        key: `plugin-candidate-${index}`,
        source,
        result: validatePluginManifest(source),
      })),
    []
  );

  const [createForm, setCreateForm] = React.useState<CreateFormState>(
    defaultCreateFormState
  );
  const [updateForm, setUpdateForm] = React.useState<UpdateFormState>({
    pluginId: '',
    patchJson: '{\n  "description": ""\n}',
    preserveExisting: true,
  });

  React.useEffect(() => {
    const firstValidEntry = candidateEntries.find((entry) => entry.result.isValid);
    if (firstValidEntry?.result.isValid) {
      setUpdateForm((prev) => ({
        ...prev,
        pluginId: firstValidEntry.result.manifest.id,
      }));
    }
  }, [candidateEntries]);

  const createPath = createForm.id.trim()
    ? `plugins/${createForm.id.trim()}/`
    : 'plugins/<id>/';

  const createIdError =
    createForm.id.trim().length > 0 &&
    !kebabCasePluginIdRegex.test(createForm.id.trim())
      ? 'Plugin id must be kebab-case (example: tags-plugin).'
      : null;

  const createResult = React.useMemo(() => {
    if (
      !createForm.id.trim() ||
      !createForm.name.trim() ||
      !createForm.description.trim() ||
      createIdError
    ) {
      return null;
    }

    const manifestCandidate = {
      id: createForm.id.trim(),
      name: createForm.name.trim(),
      version: createForm.version.trim(),
      description: createForm.description.trim(),
      enabled: createForm.enabled,
      uiExtensions: [
        {
          type: 'dashboard_tab',
          id: `${createForm.id.trim()}-dashboard`,
          title: `${createForm.name.trim()} Tab`,
          config: {
            tabId: `${createForm.id.trim()}-tab`,
            headerTitle: `${createForm.name.trim()} Dashboard`,
            component: 'replace_me',
          },
        },
      ],
    };

    return validatePluginManifest(manifestCandidate);
  }, [createForm, createIdError]);

  const selectedManifest = React.useMemo<PluginManifest | null>(() => {
    const entry = candidateEntries.find(
      (candidate) =>
        candidate.result.isValid &&
        candidate.result.manifest.id === updateForm.pluginId
    );

    return entry?.result.isValid ? entry.result.manifest : null;
  }, [candidateEntries, updateForm.pluginId]);

  const updateResult = React.useMemo(() => {
    if (!selectedManifest) {
      return {
        error: 'Select a valid plugin manifest to update.',
        result: null,
      };
    }

    const parsedPatch = parsePatchJson(updateForm.patchJson);
    if (!parsedPatch.parsed) {
      return { error: parsedPatch.error, result: null };
    }

    const mergedManifest = updateForm.preserveExisting
      ? {
          ...selectedManifest,
          ...parsedPatch.parsed,
        }
      : (parsedPatch.parsed as unknown);

    return {
      error: null,
      result: validatePluginManifest(mergedManifest),
    };
  }, [selectedManifest, updateForm.patchJson, updateForm.preserveExisting]);

  const overallSeverity = resolveOverallSeverity(candidateEntries);
  const severityCounts = candidateEntries
    .flatMap((entry) => entry.result.issues)
    .reduce(
      (acc, issue) => {
        acc[issue.severity] += 1;
        return acc;
      },
      { error: 0, warning: 0, info: 0 } as Record<
        PluginValidationSeverity,
        number
      >
    );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card className="border-primary/10">
        <CardHeader className="bg-primary/5 border-b">
          <CardTitle>Plugin Manager</CardTitle>
          <CardDescription>
            Core admin view for plugin manifest lifecycle actions: list,
            validate, create, and update.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <Alert>
            {overallSeverity === 'error' ? (
              <AlertCircle className="h-4 w-4" />
            ) : overallSeverity === 'warning' ? (
              <TriangleAlert className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <AlertTitle>
              Validation severity summary: {severityLabel(overallSeverity)}
            </AlertTitle>
            <AlertDescription className="mt-1">
              <span className="mr-4">Errors: {severityCounts.error}</span>
              <span className="mr-4">Warnings: {severityCounts.warning}</span>
              <span>Info: {severityCounts.info}</span>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">list</TabsTrigger>
          <TabsTrigger value="validate">validate</TabsTrigger>
          <TabsTrigger value="create">create</TabsTrigger>
          <TabsTrigger value="update">update</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>Manifest inventory</CardTitle>
              <CardDescription>
                Local manifest candidates with required columns and counts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>id</TableHead>
                    <TableHead>version</TableHead>
                    <TableHead>enabled</TableHead>
                    <TableHead>extension count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidateEntries.map((entry) => {
                    const fields = getManifestListFields(
                      entry.source,
                      entry.result
                    );
                    return (
                      <TableRow key={entry.key}>
                        <TableCell className="font-mono text-xs">
                          {fields.id}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {fields.version}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={fields.enabled ? 'default' : 'secondary'}
                          >
                            {fields.enabled ? 'enabled' : 'disabled'}
                          </Badge>
                        </TableCell>
                        <TableCell>{fields.extensionCount}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validate">
          <Card>
            <CardHeader>
              <CardTitle>Per-plugin validation report</CardTitle>
              <CardDescription>
                Errors and warnings are shown per plugin with highest severity.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {candidateEntries.map((entry) => {
                const summarySeverity = resolveEntrySummarySeverity(
                  entry.result.issues
                );
                const manifestId = entry.result.isValid
                  ? entry.result.manifest.id
                  : isManifestLike(entry.source) &&
                      typeof entry.source.id === 'string'
                    ? entry.source.id
                    : entry.key;

                return (
                  <div
                    key={`validate-${entry.key}`}
                    className="rounded-lg border p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{manifestId}</div>
                      <Badge className={severityBadgeClass[summarySeverity]}>
                        {severityLabel(summarySeverity)}
                      </Badge>
                    </div>

                    {entry.result.issues.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No issues found.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {entry.result.issues
                          .slice()
                          .sort(
                            (a, b) =>
                              severityOrder[b.severity] -
                              severityOrder[a.severity]
                          )
                          .map((issue, issueIndex) => (
                            <li
                              key={`${entry.key}-${issue.path}-${issueIndex}`}
                              className="text-sm"
                            >
                              <span className="font-medium">{issue.path}:</span>{' '}
                              {issue.message}{' '}
                              <Badge
                                variant="outline"
                                className={severityBadgeClass[issue.severity]}
                              >
                                {severityLabel(issue.severity)}
                              </Badge>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create plugin manifest</CardTitle>
              <CardDescription>
                Enforces kebab-case IDs and plugin path convention.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plugin-create-id">
                    Plugin id (kebab-case)
                  </Label>
                  <Input
                    id="plugin-create-id"
                    placeholder="example-plugin"
                    value={createForm.id}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        id: event.target.value,
                      }))
                    }
                  />
                  {createIdError ? (
                    <p className="text-xs text-destructive">{createIdError}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plugin-create-path">Path</Label>
                  <Input id="plugin-create-path" value={createPath} readOnly />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plugin-create-name">Name</Label>
                  <Input
                    id="plugin-create-name"
                    value={createForm.name}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plugin-create-version">Version</Label>
                  <Input
                    id="plugin-create-version"
                    value={createForm.version}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        version: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="plugin-create-description">Description</Label>
                <Textarea
                  id="plugin-create-description"
                  rows={3}
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="plugin-create-enabled"
                  checked={createForm.enabled}
                  onCheckedChange={(checked) =>
                    setCreateForm((prev) => ({ ...prev, enabled: checked }))
                  }
                />
                <Label htmlFor="plugin-create-enabled">
                  Enabled by default
                </Label>
              </div>

              <div className="rounded-lg border p-4 bg-muted/20">
                <div className="text-sm font-semibold mb-2">
                  Create validation
                </div>
                {createResult === null ? (
                  <p className="text-sm text-muted-foreground">
                    Fill out required fields to generate and validate manifest
                    payload.
                  </p>
                ) : createResult.isValid ? (
                  <p className="text-sm text-emerald-700">
                    Manifest candidate is valid and follows the initial
                    contract.
                  </p>
                ) : (
                  <ul className="text-sm space-y-1 text-destructive">
                    {createResult.issues.map((issue, index) => (
                      <li key={`create-issue-${index}`}>
                        {issue.path}: {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Button
                variant="outline"
                onClick={() => setCreateForm(defaultCreateFormState)}
              >
                Reset form
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="update">
          <Card>
            <CardHeader>
              <CardTitle>Update plugin manifest</CardTitle>
              <CardDescription>
                Merge-preserve mode is enabled by default to avoid dropping
                fields.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="plugin-update-id">Plugin id</Label>
                <Input
                  id="plugin-update-id"
                  value={updateForm.pluginId}
                  onChange={(event) =>
                    setUpdateForm((prev) => ({
                      ...prev,
                      pluginId: event.target.value,
                    }))
                  }
                  placeholder="Select an existing plugin id"
                  list="plugin-ids"
                />
                <datalist id="plugin-ids">
                  {candidateEntries
                    .filter((entry) => entry.result.isValid)
                    .map((entry) => (
                      <option
                        key={`option-${entry.key}`}
                        value={entry.result.manifest.id}
                      />
                    ))}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  Target path:{' '}
                  {updateForm.pluginId
                    ? `plugins/${updateForm.pluginId}/`
                    : 'plugins/<id>/'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="plugin-update-preserve"
                  checked={updateForm.preserveExisting}
                  onCheckedChange={(checked) =>
                    setUpdateForm((prev) => ({
                      ...prev,
                      preserveExisting: checked,
                    }))
                  }
                />
                <Label htmlFor="plugin-update-preserve">
                  Merge-preserve existing fields (default)
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="plugin-update-patch">Patch JSON</Label>
                <Textarea
                  id="plugin-update-patch"
                  rows={8}
                  className="font-mono text-xs"
                  value={updateForm.patchJson}
                  onChange={(event) =>
                    setUpdateForm((prev) => ({
                      ...prev,
                      patchJson: event.target.value,
                    }))
                  }
                />
              </div>

              {updateResult.error ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Update input required</AlertTitle>
                  <AlertDescription>{updateResult.error}</AlertDescription>
                </Alert>
              ) : updateResult.result?.isValid ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Update payload is valid</AlertTitle>
                  <AlertDescription>
                    Ready to apply manifest update with merge-preserve behavior
                    set to{' '}
                    {updateForm.preserveExisting ? 'enabled' : 'disabled'}.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Update payload has validation issues</AlertTitle>
                  <AlertDescription>
                    <ul className="text-sm space-y-1 mt-2">
                      {(updateResult.result?.issues ?? []).map(
                        (issue, index) => (
                          <li key={`update-issue-${index}`}>
                            {issue.path}: {issue.message}
                          </li>
                        )
                      )}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
