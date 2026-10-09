'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/components/auth-provider';
import { authClient } from '@/lib/auth-client';

type PasskeySummary = { id: string; name: string | null };

type PasskeyManagementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PasskeyManagementDialog({
  open,
  onOpenChange,
}: PasskeyManagementDialogProps) {
  const {
    betterAuthConfigured,
    passkeyEnrolmentEnabled,
    isPasskeySession,
    addPasskey,
  } = useAuth();
  const { refetch } = authClient.useSession();
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPasskeys = useCallback(async () => {
    if (!isPasskeySession) {
      setPasskeys([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await authClient.passkey.listUserPasskeys();
      if (result.error) throw new Error(result.error.message);
      setPasskeys(
        (result.data ?? []).map((passkey, index) => ({
          id: passkey.id,
          name: passkey.name?.trim() || `Passkey ${index + 1}`,
        }))
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load your passkeys'
      );
    } finally {
      setIsLoading(false);
    }
  }, [isPasskeySession]);

  useEffect(() => {
    if (open) void loadPasskeys();
  }, [open, loadPasskeys]);

  const handleAdd = async () => {
    setPendingId('new');
    setError(null);
    try {
      await addPasskey(newName.trim() || `Passkey ${passkeys.length + 1}`);
      await refetch();
      setNewName('');
      await loadPasskeys();
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : 'Could not add a passkey'
      );
    } finally {
      setPendingId(null);
    }
  };

  const handleRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    setPendingId(id);
    setError(null);
    try {
      const result = await authClient.passkey.updatePasskey({ id, name });
      if (result.error) throw new Error(result.error.message);
      setEditingId(null);
      await loadPasskeys();
    } catch (renameError) {
      setError(
        renameError instanceof Error
          ? renameError.message
          : 'Could not rename this passkey'
      );
    } finally {
      setPendingId(null);
    }
  };

  const handleDelete = async (passkey: PasskeySummary) => {
    if (passkeys.length <= 1) return;
    setPendingId(passkey.id);
    setError(null);
    try {
      const result = await authClient.passkey.deletePasskey({ id: passkey.id });
      if (result.error) throw new Error(result.error.message);
      await loadPasskeys();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Could not remove this passkey'
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Passkeys</DialogTitle>
          <DialogDescription>
            Add more than one passkey so you can still sign in if a device is
            lost. Synced passkeys and a hardware security key are useful options.
          </DialogDescription>
        </DialogHeader>

        {!betterAuthConfigured ? (
          <p className="text-sm text-muted-foreground">
            Passkey management is not available in this deployment yet.
          </p>
        ) : (
          <div className="space-y-5">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading passkeys...
              </div>
            ) : isPasskeySession && passkeys.length > 0 ? (
              <ul className="space-y-2" aria-label="Registered passkeys">
                {passkeys.map((passkey) => (
                  <li
                    key={passkey.id}
                    className="flex items-center gap-2 rounded-md border p-3"
                  >
                    <Fingerprint className="h-4 w-4 shrink-0 text-primary" />
                    {editingId === passkey.id ? (
                      <>
                        <Input
                          aria-label="Passkey name"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          maxLength={80}
                        />
                        <Button
                          size="sm"
                          onClick={() => void handleRename(passkey.id)}
                          disabled={pendingId === passkey.id || !editingName.trim()}
                        >
                          Save
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {passkey.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Rename ${passkey.name}`}
                          onClick={() => {
                            setEditingId(passkey.id);
                            setEditingName(passkey.name ?? '');
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${passkey.name}`}
                          title={
                            passkeys.length <= 1
                              ? 'Keep at least one passkey on your account'
                              : undefined
                          }
                          disabled={passkeys.length <= 1 || pendingId === passkey.id}
                          onClick={() => void handleDelete(passkey)}
                        >
                          {pendingId === passkey.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : isPasskeySession ? (
              <p className="text-sm text-muted-foreground">
                No passkeys are registered yet.
              </p>
            ) : passkeyEnrolmentEnabled ? (
              <p className="text-sm text-muted-foreground">
                Add your first passkey to link this Firebase account. You will
                remain signed in to the same MatMetrics account.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Passkey enrolment is currently disabled.
              </p>
            )}

            {passkeyEnrolmentEnabled ? (
              <div className="space-y-2">
                <Label htmlFor="new-passkey-name">Name for the new passkey</Label>
                <div className="flex gap-2">
                  <Input
                    id="new-passkey-name"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="e.g. iPhone or YubiKey"
                    maxLength={80}
                  />
                  <Button
                    type="button"
                    onClick={() => void handleAdd()}
                    disabled={pendingId === 'new'}
                  >
                    {pendingId === 'new' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span className="sr-only sm:not-sr-only">Add</span>
                  </Button>
                </div>
              </div>
            ) : null}

            {passkeys.length === 1 && isPasskeySession ? (
              <p className="text-xs text-muted-foreground">
                Keep this passkey until another one has been added and tested.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
