'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAuthHeaders } from '@/lib/auth-session';

interface ScanFileResult {
  path: string;
  status: 'valid' | 'invalid';
  errors?: string[];
  id?: string;
  date?: string;
}

interface ScanResult {
  success: boolean;
  message: string;
  branch?: string;
  summary: {
    totalFiles: number;
    validFiles: number;
    invalidFiles: number;
  };
  files: ScanFileResult[];
}

interface FixFileResult {
  path: string;
  status: 'preview' | 'unchanged' | 'applied' | 'error';
  message?: string;
  commitSha?: string;
  validationState: {
    before: string;
    after: string;
    errors?: string[];
  };
  preview: {
    changed: boolean;
    diff: string;
    originalBytes: number;
    updatedBytes: number;
  };
}

interface FixResult {
  success: boolean;
  message: string;
  mode: 'dry-run' | 'apply';
  branch?: string;
  files: FixFileResult[];
}

const parseApiResponse = async <T,>(response: Response): Promise<T> => {
  const payload = (await response.json()) as T;
  if (!response.ok) {
    const maybeMessage =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message?: unknown }).message ?? 'Request failed')
        : 'Request failed';
    throw new Error(maybeMessage);
  }
  return payload;
};

export const LogDoctor = (): React.ReactElement => {
  const { preferences } = useAuth();
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');

  const [isScanning, setIsScanning] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

  useEffect(() => {
    const config = preferences.gitHub.config;
    if (!config) return;

    setOwner(config.owner);
    setRepo(config.repo);
    setBranch(config.branch ?? '');
  }, [preferences.gitHub.config]);

  const invalidFiles = useMemo(
    () => scanResult?.files.filter((file) => file.status === 'invalid') ?? [],
    [scanResult]
  );

  const selectedCount = selectedPaths.length;

  const togglePath = (path: string): void => {
    setSelectedPaths((current) =>
      current.includes(path)
        ? current.filter((item) => item !== path)
        : [...current, path]
    );
  };

  const handleScan = async (): Promise<void> => {
    setErrorMessage(null);
    setFixResult(null);
    setIsScanning(true);
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/github/log-doctor', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          owner: owner.trim(),
          repo: repo.trim(),
          branch: branch.trim() || undefined,
        }),
      });

      const payload = await parseApiResponse<ScanResult>(response);
      setScanResult(payload);
      const defaults = payload.files
        .filter((file) => file.status === 'invalid')
        .map((file) => file.path);
      setSelectedPaths(defaults);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scan failed';
      setErrorMessage(message);
    } finally {
      setIsScanning(false);
    }
  };

  const handlePreviewFixes = async (): Promise<void> => {
    if (selectedPaths.length === 0) {
      setErrorMessage('Select at least one file before previewing fixes.');
      return;
    }

    setErrorMessage(null);
    setIsPreviewing(true);
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/github/log-doctor/fix', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          owner: owner.trim(),
          repo: repo.trim(),
          branch: branch.trim() || undefined,
          mode: 'dry-run',
          confirmApply: false,
          paths: selectedPaths,
          options: {
            normalizeFrontmatter: true,
            enforceSectionOrder: true,
            preserveUserContent: true,
          },
        }),
      });

      setFixResult(await parseApiResponse<FixResult>(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preview failed';
      setErrorMessage(message);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleApplyFixes = async (): Promise<void> => {
    if (selectedPaths.length === 0) {
      setErrorMessage('Select at least one file before applying fixes.');
      return;
    }

    const confirmed = window.confirm(
      `Apply normalization fixes to ${selectedPaths.length} selected file(s) on ${branch.trim() || 'default branch'}?`
    );
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setIsApplying(true);
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/github/log-doctor/fix', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          owner: owner.trim(),
          repo: repo.trim(),
          branch: branch.trim() || undefined,
          mode: 'apply',
          confirmApply: true,
          paths: selectedPaths,
          options: {
            normalizeFrontmatter: true,
            enforceSectionOrder: true,
            preserveUserContent: true,
          },
        }),
      });

      setFixResult(await parseApiResponse<FixResult>(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Apply failed';
      setErrorMessage(message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <h2 className="text-lg font-semibold">Log Doctor</h2>
      <p className="text-sm text-muted-foreground">
        Scan, preview, and optionally apply markdown normalization fixes in two
        steps.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Repository target</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="log-doctor-owner">Owner</Label>
            <Input
              id="log-doctor-owner"
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="log-doctor-repo">Repository</Label>
            <Input
              id="log-doctor-repo"
              value={repo}
              onChange={(event) => setRepo(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="log-doctor-branch">Branch (optional)</Label>
            <Input
              id="log-doctor-branch"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleScan} disabled={isScanning || !owner || !repo}>
          {isScanning ? 'Scanning…' : 'Scan repository'}
        </Button>
        <Button
          variant="secondary"
          onClick={handlePreviewFixes}
          disabled={isPreviewing || selectedCount === 0}
        >
          {isPreviewing ? 'Previewing…' : 'Preview fixes'}
        </Button>
        <Button
          variant="default"
          onClick={handleApplyFixes}
          disabled={isApplying || selectedCount === 0}
        >
          {isApplying ? 'Applying…' : 'Apply fixes'}
        </Button>
      </div>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Log Doctor error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {scanResult ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scan results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">
                Total: {scanResult.summary.totalFiles}
              </Badge>
              <Badge variant="outline">
                Valid: {scanResult.summary.validFiles}
              </Badge>
              <Badge variant="destructive">
                Invalid: {scanResult.summary.invalidFiles}
              </Badge>
              <Badge variant="secondary">Selected: {selectedCount}</Badge>
            </div>

            {invalidFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No invalid files found.
              </p>
            ) : (
              <div className="space-y-2">
                {invalidFiles.map((file) => (
                  <div
                    key={file.path}
                    className="rounded-md border p-3 text-sm space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`select-${file.path}`}
                          checked={selectedPaths.includes(file.path)}
                          onChange={() => togglePath(file.path)}
                        />
                        <Label
                          className="cursor-pointer break-all"
                          htmlFor={`select-${file.path}`}
                        >
                          {file.path}
                        </Label>
                      </div>
                      <Badge variant="destructive">invalid</Badge>
                    </div>
                    {(file.errors ?? []).length > 0 ? (
                      <ul className="list-disc pl-5 text-destructive">
                        {file.errors?.map((entry) => (
                          <li key={`${file.path}-${entry}`}>{entry}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {fixResult ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Fix result ({fixResult.mode})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{fixResult.message}</p>
            {fixResult.files.map((file) => (
              <div key={`fix-${file.path}`} className="rounded-md border p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium break-all">
                    {file.path}
                  </span>
                  <Badge
                    variant={
                      file.status === 'error' ? 'destructive' : 'outline'
                    }
                  >
                    {file.status}
                  </Badge>
                </div>
                {file.message ? (
                  <p className="mb-2 text-xs text-muted-foreground">
                    {file.message}
                  </p>
                ) : null}
                {file.validationState.errors?.length ? (
                  <ul className="mb-2 list-disc pl-5 text-xs text-destructive">
                    {file.validationState.errors.map((entry) => (
                      <li key={`${file.path}-err-${entry}`}>{entry}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mb-2 text-xs text-muted-foreground">
                  Validation: {file.validationState.before} →{' '}
                  {file.validationState.after}
                  {file.commitSha ? ` · commit ${file.commitSha}` : ''}
                </div>
                <div className="max-h-56 overflow-auto rounded border bg-muted p-2 font-mono text-xs">
                  <pre className="whitespace-pre-wrap break-words">
                    {file.preview.diff}
                  </pre>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
};
