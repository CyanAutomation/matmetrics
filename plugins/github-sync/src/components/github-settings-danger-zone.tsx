import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';
import { PluginFormSection } from '@/components/plugins/plugin-kit';
import { PluginActionRow, PluginActionDestructive, PluginActionTrailing } from '@/components/plugins/plugin-action-row';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';

type Props = {
  controlState: any;
  handleDisable: () => Promise<void> | void;
  setIsClearDialogOpen: (v: boolean) => void;
  isDisabling: boolean;
  isClearing: boolean;
};

export function GitHubSettingsDangerZone({
  controlState,
  handleDisable,
  setIsClearDialogOpen,
  isDisabling,
  isClearing,
}: Props) {
  return (
    <details className="rounded-xl bg-[hsl(var(--color-surface-container-low))] px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-destructive">Danger zone</summary>
      <div className="mt-4">
        <PluginFormSection
          title="Danger zone"
          description="These actions stop syncing or remove the saved repository connection. Your existing training records are not deleted."
          className="border-destructive/30"
          footerActions={
            <PluginActionRow>
              <PluginActionDestructive>
                <Button
                  onClick={() => void handleDisable()}
                  disabled={!controlState?.canDisableSync}
                  variant="outline"
                  className={`gap-2 ${getPluginUiTokenClassNames('action.destructive')}`}
                >
                  {isDisabling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isDisabling ? controlState?.disableLabel : 'Disable sync'}
                </Button>
              </PluginActionDestructive>
              <PluginActionTrailing>
                <Button
                  onClick={() => setIsClearDialogOpen(true)}
                  disabled={!controlState?.canOpenClearDialog}
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                >
                  {isClearing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Clear saved connection
                </Button>
              </PluginActionTrailing>
            </PluginActionRow>
          }
        />
      </div>
    </details>
  );
}

export default GitHubSettingsDangerZone;
