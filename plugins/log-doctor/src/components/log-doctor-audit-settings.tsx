'use client';

import React, { useState } from 'react';

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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { ChevronDown, ChevronUp } from 'lucide-react';

import type { AuditConfig, AuditRuleConfig } from '@/lib/types';

export type AuditSettingsProps = {
  config: AuditConfig;
  sessionCount: number;
  onConfigChange: (config: AuditConfig) => Promise<void>;
};

const RULE_DESCRIPTIONS: Record<string, { label: string; description: string }> =
  {
    no_techniques_high_effort: {
      label: 'No techniques (high effort)',
      description: 'Flag sessions with high effort but no techniques recorded.',
    },
    empty_description: {
      label: 'Missing description',
      description: 'Flag sessions without a description.',
    },
    empty_notes: {
      label: 'Missing notes',
      description: 'Flag sessions without notes.',
    },
    duration_outlier: {
      label: 'Unusual duration',
      description:
        'Flag sessions with durations far from the average. Requires at least 3 sessions with duration data.',
    },
  };

export const AuditSettings: React.FC<AuditSettingsProps> = ({
  config,
  sessionCount,
  onConfigChange,
}) => {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localConfig, setLocalConfig] = useState<AuditConfig>(config);

  const handleRuleToggle = (code: string, enabled: boolean): void => {
    setLocalConfig({
      rules: localConfig.rules.map((rule) =>
        rule.code === code ? { ...rule, enabled } : rule
      ),
    });
  };

  const handleParamChange = (
    code: string,
    paramName: string,
    value: number
  ): void => {
    setLocalConfig({
      rules: localConfig.rules.map((rule) =>
        rule.code === code
          ? {
              ...rule,
              [paramName]: value,
            }
          : rule
      ),
    });
  };

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      await onConfigChange(localConfig);
      toast({
        title: 'Settings saved',
        description: 'Audit rule configuration has been updated.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save audit settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(localConfig);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Audit Settings</CardTitle>
            <CardDescription>Customize audit rules and detection thresholds</CardDescription>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6">
          {localConfig.rules.map((rule) => {
            const desc = RULE_DESCRIPTIONS[rule.code];
            const isDurationOutlier = rule.code === 'duration_outlier';
            const showDurationWarning =
              isDurationOutlier && rule.enabled && sessionCount < 3;

            return (
              <div key={rule.code} className="space-y-3 border-b pb-4 last:border-b-0">
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
                      You currently have {sessionCount} session{sessionCount !== 1 ? 's' : ''}.
                    </AlertDescription>
                  </Alert>
                )}

                {rule.enabled && rule.code === 'no_techniques_high_effort' && (
                  <div className="mt-2 space-y-2">
                    <Label htmlFor={`effort-${rule.code}`} className="text-sm">
                      Effort threshold (1-5):
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
                          Math.max(1, Math.min(5, parseInt(e.target.value, 10)))
                        )
                      }
                      aria-label="Effort level threshold"
                    />
                    <p className="text-xs text-muted-foreground">
                      Sessions with effort ≥ this level will be flagged if they
                      have no techniques.
                    </p>
                  </div>
                )}

                {rule.enabled && rule.code === 'duration_outlier' && (
                  <div className="mt-2 space-y-2">
                    <Label
                      htmlFor={`duration-${rule.code}`}
                      className="text-sm"
                    >
                      Standard deviation multiplier:
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
                          Math.max(0.5, Math.min(5, parseFloat(e.target.value)))
                        )
                      }
                      aria-label="Outlier threshold"
                    />
                    <p className="text-xs text-muted-foreground">
                      Durations outside mean ± (stddev × value) will be flagged.
                      Lower values = more sensitive.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {hasChanges && (
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                size="sm"
              >
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
              <Button
                onClick={() => setLocalConfig(config)}
                disabled={isSaving}
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};
