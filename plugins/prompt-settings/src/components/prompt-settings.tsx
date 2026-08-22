'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  BrainCircuit,
  Save,
  RotateCcw,
  Info,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth-provider';
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginNotice } from '@/components/plugins/plugin-notice';
import { PluginAuthGateNotice } from '@/components/plugins/plugin-auth-gate-notice';
import { usePromptSettingsActions } from './use-prompt-settings-actions';
import {
  PluginEmptyState,
  PluginErrorState,
  PluginLoadingState,
  PluginSuccessState,
} from '@/components/plugins/plugin-state';
import { PluginConfirmationDialog } from '@/components/plugins/plugin-confirmation';
import {
  PluginFormSection,
  PluginStatusPanel,
} from '@/components/plugins/plugin-kit';

import {
  PluginActionPrimary,
  PluginActionRow,
  PluginActionSecondary,
} from '@/components/plugins/plugin-action-row';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { getPluginThemeTokens } from '@/components/plugins/plugin-theme';
export {
  derivePromptSettingsUiState,
  derivePromptSettingsViewState,
  PROMPT_SETTINGS_DESTRUCTIVE_CANCEL_LABEL,
  PROMPT_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL,
  PROMPT_SETTINGS_EMPTY_STATE_CTA_ACTION,
  PROMPT_SETTINGS_EMPTY_STATE_CTA_TEXT,
  PROMPT_SETTINGS_ERROR_RETRY_LABEL,
  PROMPT_SETTINGS_LOADING_TEXT,
  resolvePromptAfterDestructiveResetAction,
  runPromptLoadRecoveryFlow,
  runPromptResetFlow,
  runPromptSaveFlow,
} from './prompt-settings-view-model';
import {
  derivePromptSettingsViewState,
  PROMPT_SETTINGS_DESTRUCTIVE_CANCEL_LABEL,
  PROMPT_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL,
  PROMPT_SETTINGS_EMPTY_STATE_CTA_TEXT,
  PROMPT_SETTINGS_ERROR_RETRY_LABEL,
  PROMPT_SETTINGS_LOADING_TEXT,
  resolvePromptAfterDestructiveResetAction,
} from './prompt-settings-view-model';

export function PromptSettings() {
  const { toast } = useToast();
  const {
    user,
    preferences,
    preferencesReady,
    preferencesError,
    canSavePreferences,
    authAvailable,
    retryPreferencesLoad,
  } = useAuth();
  const [prompt, setPrompt] = useState('');
  const theme = getPluginThemeTokens('info');
  const {
    saveStatus,
    saveError,
    setSaveStatus,
    setSaveError,
    isRetryingLoad,
    isSaving,
    isResetting,
    isResetDialogOpen,
    setIsResetDialogOpen,
    handleSave,
    handleReset,
    handleRetryLoad,
  } = usePromptSettingsActions({
    user,
    prompt,
    setPrompt,
    toast,
    retryPreferencesLoad,
  });
  const {
    isPromptMeaningful,
    areControlsDisabled,
    canSubmitPrompt,
    isLoadingSavedSettings,
    hasLoadError,
    isUsingDefaultProfile,
    hasSaveError,
    hasSaveSuccess,
  } = derivePromptSettingsViewState({
    prompt,
    canSavePreferences,
    preferencesReady,
    preferencesError,
    isSaving,
    isResetting,
    saveStatus,
  });

  useEffect(() => {
    setPrompt(preferences.transformerPrompt);
  }, [preferences.transformerPrompt]);

  return (
    <PluginPageShell
      title="AI Transformation Prompt"
      description="Edit the instructions used to polish your practice descriptions."
      tone="info"
      icon={<BrainCircuit className="h-6 w-6" />}
      notice={
        <PluginNotice
          tone="info"
          icon={<Info className="h-4 w-4" />}
          title="Customizing the AI"
          description='The "AI Transform" button in the log form uses these instructions to rewrite your notes. You can change the tone (e.g., "be more formal" or "be very brief") or define terminology preferences (e.g., Judo terms like "uchi mata" or BJJ terms like "armbar") here.'
        />
      }
      className="animate-in slide-in-from-bottom-4 fade-in duration-500"
    >
      {!canSavePreferences && (
        <PluginAuthGateNotice
          className={theme.warningTone}
          isAuthenticated={Boolean(user)}
          authAvailable={authAvailable}
          signedInDescription="Custom AI prompts are only available for signed-in accounts because prompt preferences are stored per user."
          signedOutDescription="Custom AI prompts are unavailable because Firebase authentication is not configured for this deployment."
        />
      )}

      <PluginFormSection
        title="Quick preferences"
        description="Start with a writing style, then fine-tune the full instructions only if you need to."
      >
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ['Reflective', 'Use an informal, personal, and reflective tone.'],
            ['Brief', 'Keep the final diary entry concise and focused on the most useful details.'],
            ['Technical', 'Prioritize precise technique names, key mechanics, and specific learning points.'],
          ].map(([label, instruction]) => (
            <Button
              key={label}
              type="button"
              variant="outline"
              size="sm"
              disabled={areControlsDisabled}
              onClick={() => {
                setPrompt((current) => current.includes(instruction) ? current : `${current.trim()}\n\n${instruction}`.trim());
                setSaveStatus('idle');
                setSaveError(null);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </PluginFormSection>

      <PluginFormSection
        title="Prompt profile"
        description="Define system instructions used by the AI transform action."
        footerClassName="p-6"
        footerActions={
          <PluginActionRow>
            <PluginActionSecondary>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsResetDialogOpen(true)}
                disabled={areControlsDisabled}
                className={`gap-2 ${getPluginUiTokenClassNames('action.secondary')}`}
              >
                {isResetting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {isResetting ? 'Resetting…' : 'Reset to Default'}
              </Button>
            </PluginActionSecondary>
            <PluginActionPrimary>
              <Button
                onClick={() => void handleSave()}
                disabled={!canSubmitPrompt}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : hasSaveSuccess ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving
                  ? 'Saving…'
                  : hasSaveSuccess
                    ? 'Saved!'
                    : 'Save Prompt'}
              </Button>
            </PluginActionPrimary>
          </PluginActionRow>
        }
      >
        {isLoadingSavedSettings && (
          <PluginLoadingState description={PROMPT_SETTINGS_LOADING_TEXT} />
        )}

        {hasLoadError && (
          <PluginErrorState
            title="Could not load saved prompt profile"
            message="We could not load your saved settings. Retry to fetch the latest prompt profile."
            onRetry={() => void handleRetryLoad()}
            retryLabel={
              isRetryingLoad ? 'Retrying…' : PROMPT_SETTINGS_ERROR_RETRY_LABEL
            }
            details={preferencesError?.message ?? 'Unknown load error'}
          />
        )}

        {isUsingDefaultProfile && (
          <PluginEmptyState
            title="Start your first prompt profile"
            description={
              <>
                You are currently using the default prompt.{' '}
                {PROMPT_SETTINGS_EMPTY_STATE_CTA_TEXT}
              </>
            }
            icon={<Info className="h-4 w-4" />}
          />
        )}

        {hasSaveError && (
          <PluginStatusPanel
            variant="error"
            title="Prompt save failed"
            description={
              saveError?.message
                ? `Your changes were not saved. ${saveError.message}`
                : 'Your changes were not saved. Retry when you are ready.'
            }
            onCta={() => void handleSave()}
            ctaLabel="Retry save"
          />
        )}

        {hasSaveSuccess && (
          <PluginSuccessState
            title="Prompt saved"
            description="Your prompt profile is up to date."
            icon={
              <CheckCircle2
                className={`h-4 w-4 ${getPluginUiTokenClassNames('icon.success')}`}
              />
            }
          />
        )}

        {!isLoadingSavedSettings && (
          <div className="space-y-3">
            <Label
              htmlFor="custom-prompt"
              className="text-sm font-bold flex items-center gap-2"
            >
              Advanced instructions
              <span
                className={`text-xs font-normal ${getPluginUiTokenClassNames('text.subtle')}`}
              >
                (optional template variables)
              </span>
            </Label>
            <Textarea
              id="custom-prompt"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setSaveStatus('idle');
                setSaveError(null);
              }}
              placeholder="Enter your custom instructions here..."
              disabled={areControlsDisabled}
              className="min-h-[400px] font-mono text-sm bg-background/75 border-ghost focus:border-ring transition-colors leading-relaxed"
            />
            <p
              className={`text-[11px] italic ${getPluginUiTokenClassNames('text.subtle')}`}
            >
              {isPromptMeaningful
                ? 'Your practice description is automatically included when the AI transforms a session. You only need template variables for advanced customisation.'
                : 'Add at least one instruction before saving. Blank prompts cannot be saved.'}
            </p>
          </div>
        )}
      </PluginFormSection>
      <PluginConfirmationDialog
        open={isResetDialogOpen}
        onOpenChange={setIsResetDialogOpen}
        title="Reset custom prompt?"
        description="This will replace your custom instructions with the default prompt. You can still edit it again afterward."
        confirmLabel={PROMPT_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL}
        pendingLabel="Resetting…"
        cancelLabel={PROMPT_SETTINGS_DESTRUCTIVE_CANCEL_LABEL}
        onCancel={() => {
          setPrompt((currentPrompt) =>
            resolvePromptAfterDestructiveResetAction({
              action: 'cancel',
              currentPrompt,
            })
          );
          setIsResetDialogOpen(false);
        }}
        onConfirm={() => void handleReset()}
        isPending={isResetting}
      />
    </PluginPageShell>
  );
}
