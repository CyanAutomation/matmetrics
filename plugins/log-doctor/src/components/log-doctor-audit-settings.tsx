'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { useToast } from '@/hooks/use-toast';
import {
  areAuditConfigsEqual,
  getAuditConfigPresetByStrictness,
  getAuditModeForStrictnessPreset,
  inferStrictnessPresetFromAudit,
  normalizeAuditConfigShape,
  type AuditStrictnessPreset,
} from '@/lib/audit-presets';
import type { AuditConfig, AuditMode } from '@/lib/types';

export type AuditSettingsProps = {
  mode: AuditMode;
  config: AuditConfig;
  sessionCount: number;
  onConfigChange: (config: AuditConfig, mode: AuditMode) => Promise<void>;
};

const RULE_DESCRIPTIONS: Record<
  string,
  { label: string; description: string }
> = {
  no_techniques_high_effort: {
    label: 'Missing techniques in hard sessions',
    description:
      'Flags hard sessions that are missing the technique names you practiced.',
  },
  empty_description: {
    label: 'Missing session summary',
    description: 'Flags sessions that do not explain what you worked on.',
  },
  empty_notes: {
    label: 'Missing follow-up notes',
    description:
      'Flags sessions without notes on what went well or what to improve next.',
  },
  duration_outlier: {
    label: 'Session time looks off',
    description:
      'Flags sessions with very different durations so you can confirm the time entry is correct. Requires at least 3 sessions with duration data.',
  },
};

const PRIMARY_PRESET_OPTIONS: Array<{
  value: AuditStrictnessPreset;
  label: string;
  description: string;
}> = [
  {
    value: 'gentle',
    label: 'Gentle',
    description: 'Fewer alerts, focused on the most obvious issues.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Recommended everyday checks for quality and consistency.',
  },
  {
    value: 'thorough',
    label: 'Thorough',
    description: 'Most sensitive checks for stricter review.',
  },
];

export const AuditSettings: React.FC<AuditSettingsProps> = ({
  mode,
  config,
  sessionCount,
  onConfigChange,
}) => {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [localConfig, setLocalConfig] = useState<AuditConfig>(
    normalizeAuditConfigShape(config)
  );
  const [selectedPreset, setSelectedPreset] =
    useState<AuditStrictnessPreset | null>(
      inferStrictnessPresetFromAudit(mode, config)
    );

  useEffect(() => {
    setLocalConfig(normalizeAuditConfigShape(config));
    setSelectedPreset(inferStrictnessPresetFromAudit(mode, config));
  }, [mode, config]);

  const effectiveConfig = useMemo(() => {
    if (selectedPreset) {
      return getAuditConfigPresetByStrictness(selectedPreset);
    }
    return normalizeAuditConfigShape(localConfig);
  }, [localConfig, selectedPreset]);

  const effectiveMode = useMemo<AuditMode>(() => {
    if (selectedPreset) {
      return getAuditModeForStrictnessPreset(selectedPreset);
    }
    return 'custom';
  }, [selectedPreset]);

  const handleRuleToggle = (code: string, enabled: boolean): void => {
    setSelectedPreset(null);
    setLocalConfig((prev) => ({
      rules: prev.rules.map((rule) =>
        rule.code === code ? { ...rule, enabled } : rule
      ),
    }));
  };

  const handleParamChange = (
    code: string,
    paramName: string,
    value: number
  ): void => {
    setSelectedPreset(null);
    setLocalConfig((prev) => ({
      rules: prev.rules.map((rule) =>
        rule.code === code
          ? {
              ...rule,
              [paramName]: value,
            }
          : rule
      ),
    }));
  };

  const handlePrimaryPresetChange = (preset: AuditStrictnessPreset): void => {
    setSelectedPreset(preset);
    setLocalConfig(getAuditConfigPresetByStrictness(preset));
  };

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      await onConfigChange(effectiveConfig, effectiveMode);
      toast({
        title: 'Settings saved',
        description: 'Audit rule configuration has been updated.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save audit settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    effectiveMode !== mode || !areAuditConfigsEqual(effectiveConfig, config);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit Settings</CardTitle>
        <CardDescription>
          Choose a single audit strictness level. Advanced rule tuning is
          optional.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-3 border-b pb-4">
          <Label className="block font-medium">
            How sensitive should checks be?
          </Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRIMARY_PRESET_OPTIONS.map((option) => {
              const isActive = selectedPreset === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handlePrimaryPresetChange(option.value)}
                  className={`rounded-md border p-3 text-left transition ${
                    isActive
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:bg-muted/30'
                  }`}
                  aria-pressed={isActive}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
          {selectedPreset === null && (
            <p className="text-xs text-muted-foreground">
              Using custom advanced settings.
            </p>
          )}
        </div>

        <div className="rounded-md border border-dashed bg-muted/20 p-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Advanced checks
            </p>
            <p className="text-xs text-muted-foreground">
              Customize each check when you need more control.
            </p>
          </div>

          {normalizeAuditConfigShape(localConfig).rules.map((rule) => {
            const desc = RULE_DESCRIPTIONS[rule.code];
            const isDurationOutlier = rule.code === 'duration_outlier';
            const showDurationWarning =
              isDurationOutlier && rule.enabled && sessionCount < 3;

            return (
              <div
                key={rule.code}
                className="mt-4 space-y-3 border-t pt-4 first:mt-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <Label className="block font-medium">{desc.label}</Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {desc.description}
                    </p>
                  </div>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(checked) =>
                      handleRuleToggle(rule.code, checked)
                    }
                    aria-label={`Toggle ${desc.label}`}
                  />
                </div>

                {showDurationWarning && (
                  <Alert className="border-yellow-200 bg-yellow-50">
                    <AlertDescription className="text-sm text-yellow-800">
                      This rule requires at least 3 sessions with duration data.
                      You currently have {sessionCount} session
                      {sessionCount !== 1 ? 's' : ''}.
                    </AlertDescription>
                  </Alert>
                )}

                {rule.enabled && rule.code === 'no_techniques_high_effort' ? (
                  <div className="mt-2 space-y-2">
                    <Label htmlFor={`effort-${rule.code}`} className="text-sm">
                      When should this check apply? (effort 1-5)
                    </Label>
                    <Input
                      id={`effort-${rule.code}`}
                      type="number"
                      min="1"
                      max="5"
                      value={rule.effortThreshold ?? 4}
                      onChange={(e) =>
                        handleParamChange(
                          rule.code,
                          'effortThreshold',
                          Math.max(
                            1,
                            Math.min(5, Number.parseInt(e.target.value, 10))
                          )
                        )
                      }
                      aria-label="Effort level threshold"
                    />
                  </div>
                ) : null}

                {rule.enabled && rule.code === 'duration_outlier' ? (
                  <div className="mt-2 space-y-2">
                    <Label
                      htmlFor={`duration-${rule.code}`}
                      className="text-sm"
                    >
                      How different should session time be before it is flagged?
                    </Label>
                    <Input
                      id={`duration-${rule.code}`}
                      type="number"
                      min="0.5"
                      max="5"
                      step="0.5"
                      value={rule.durationStdDevMultiplier ?? 2}
                      onChange={(e) =>
                        handleParamChange(
                          rule.code,
                          'durationStdDevMultiplier',
                          Math.max(
                            0.5,
                            Math.min(5, Number.parseFloat(e.target.value))
                          )
                        )
                      }
                      aria-label="Outlier threshold"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {hasChanges && (
          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={isSaving} size="sm">
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              onClick={() => {
                setSelectedPreset(inferStrictnessPresetFromAudit(mode, config));
                setLocalConfig(normalizeAuditConfigShape(config));
              }}
              disabled={isSaving}
              variant="outline"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
