'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Save, SlidersHorizontal } from 'lucide-react';

import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginAuthGateNotice } from '@/components/plugins/plugin-auth-gate-notice';
import { PluginConfirmationDialog } from '@/components/plugins/plugin-confirmation';
import {
  PluginEmptyState,
  PluginErrorState,
  PluginLoadingState,
  PluginSuccessState,
} from '@/components/plugins/plugin-state';
import { PluginFormSection } from '@/components/plugins/plugin-kit';
import { PluginSettingRow } from '@/components/plugins/plugin-setting-row';
import { SESSION_CATEGORIES, type SessionCategory } from '@/lib/types';
import { saveSessionTypePreferences } from '@/lib/user-preferences';

export function SessionTypes() {
  const {
    user,
    preferences,
    preferencesReady,
    preferencesError,
    canSavePreferences,
    authAvailable,
    retryPreferencesLoad,
  } = useAuth();
  const [enabledCategories, setEnabledCategories] = useState<SessionCategory[]>(
    preferences.sessionTypes.enabledCategories
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [saved, setSaved] = useState(false);
  const [categoryPendingDisable, setCategoryPendingDisable] =
    useState<SessionCategory | null>(null);

  useEffect(() => {
    setEnabledCategories(preferences.sessionTypes.enabledCategories);
  }, [preferences.sessionTypes.enabledCategories]);

  const setCategoryEnabled = (category: SessionCategory, enabled: boolean) => {
    setSaved(false);
    setSaveError(null);
    setEnabledCategories((current) =>
      SESSION_CATEGORIES.filter(
        (candidate) =>
          candidate === 'Technical' ||
          (candidate === category ? enabled : current.includes(candidate))
      )
    );
  };

  const toggleCategory = (category: SessionCategory, enabled: boolean) => {
    if (category === 'Technical') return;
    if (!enabled) {
      setCategoryPendingDisable(category);
      return;
    }
    setCategoryEnabled(category, true);
  };

  const save = async () => {
    if (!user || !canSavePreferences) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveSessionTypePreferences(user.uid, { enabledCategories });
      setSaved(true);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error
          : new Error('Could not save session types')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const hasOnlyTechnical = enabledCategories.length === 1;

  return (
    <PluginPageShell
      title="Session Types"
      description="Choose the practices available when you log training and set your plan. Technical is always available."
      icon={<SlidersHorizontal className="h-6 w-6" />}
      tone="info"
    >
      {!canSavePreferences && (
        <PluginAuthGateNotice
          isAuthenticated={Boolean(user)}
          authAvailable={authAvailable}
          signedInDescription="Session-type preferences are stored securely for your account."
          signedOutDescription="Sign in to customise the session types available in your workspace."
        />
      )}

      <PluginFormSection
        title="Available session types"
        description="Disabled types are removed from new-session and training-plan choices. Existing records always remain intact."
        footerActions={
          <Button
            onClick={() => void save()}
            disabled={!canSavePreferences || isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        }
      >
        {!preferencesReady && (
          <PluginLoadingState description="Loading saved session-type settings…" />
        )}
        {preferencesError && (
          <PluginErrorState
            title="Could not load session types"
            message="Retry to load your saved session-type settings."
            details={preferencesError.message}
            onRetry={() => void retryPreferencesLoad()}
            retryLabel="Retry"
          />
        )}
        {preferencesReady && hasOnlyTechnical && (
          <PluginEmptyState
            title="Technical is your only enabled type"
            description="Enable another type below when it becomes part of your training."
          />
        )}
        {saveError && (
          <PluginErrorState
            title="Could not save session types"
            message="Your changes have not been saved yet. Retry when you are ready."
            details={saveError.message}
            onRetry={() => void save()}
            retryLabel="Retry save"
          />
        )}
        {saved && (
          <PluginSuccessState
            title="Session types saved"
            description="Your logging and planning choices are up to date."
            icon={<Check className="h-4 w-4" />}
          />
        )}
        {preferencesReady && !preferencesError && (
          <div className="divide-y divide-border rounded-lg border border-border">
            {SESSION_CATEGORIES.map((category) => {
              const required = category === 'Technical';
              const enabled = enabledCategories.includes(category);
              return (
                <PluginSettingRow
                  key={category}
                  title={
                    <Label htmlFor={`session-type-${category}`}>
                      {category}
                    </Label>
                  }
                  badge={
                    required ? (
                      <Badge variant="secondary">Required</Badge>
                    ) : null
                  }
                  description={
                    required
                      ? 'Always available in logging and plans.'
                      : enabled
                        ? 'Available in new session logs and training plans.'
                        : 'Hidden from new session logs and training plans.'
                  }
                  control={
                    <Switch
                      id={`session-type-${category}`}
                      checked={enabled}
                      disabled={required || !canSavePreferences || isSaving}
                      aria-label={`${required ? 'Required' : 'Toggle'} ${category} session type`}
                      onCheckedChange={(checked) =>
                        toggleCategory(category, checked)
                      }
                    />
                  }
                />
              );
            })}
          </div>
        )}
      </PluginFormSection>
      <PluginConfirmationDialog
        open={categoryPendingDisable !== null}
        onOpenChange={(open) => {
          if (!open) setCategoryPendingDisable(null);
        }}
        title="Disable this session type?"
        description={
          categoryPendingDisable
            ? `${categoryPendingDisable} will be hidden from new session logs and training plans. Existing sessions will remain unchanged.`
            : ''
        }
        confirmLabel="Disable session type"
        cancelLabel="Cancel"
        onCancel={() => setCategoryPendingDisable(null)}
        onConfirm={() => {
          if (categoryPendingDisable) {
            setCategoryEnabled(categoryPendingDisable, false);
          }
          setCategoryPendingDisable(null);
        }}
      />
    </PluginPageShell>
  );
}
