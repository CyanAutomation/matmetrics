'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { authClient } from '@/lib/auth-client';
import {
  PasskeyManagementDialogView,
  type PasskeySummary,
} from './passkey-management-dialog-view';

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
    hasBetterAuthSession,
    user,
    addPasskey,
    sendEmailVerification,
    sendPasswordReset,
  } = useAuth();
  const { refetch } = authClient.useSession();
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPasskeys = useCallback(async () => {
    if (!hasBetterAuthSession) {
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
  }, [hasBetterAuthSession]);

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

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setIsSendingReset(true);
    setPasswordResetSent(false);
    setError(null);
    try {
      await sendPasswordReset(user.email);
      setPasswordResetSent(true);
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : 'Could not send a password setup link'
      );
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleEmailVerification = async () => {
    if (!user?.email) return;
    setIsSendingVerification(true);
    setVerificationSent(false);
    setError(null);
    try {
      await sendEmailVerification(user.email);
      setVerificationSent(true);
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : 'Could not send an email verification link'
      );
    } finally {
      setIsSendingVerification(false);
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
    <PasskeyManagementDialogView
      open={open}
      onOpenChange={onOpenChange}
      betterAuthConfigured={betterAuthConfigured}
      passkeyEnrolmentEnabled={passkeyEnrolmentEnabled}
      hasBetterAuthSession={hasBetterAuthSession}
      userEmail={user?.email ?? undefined}
      userEmailVerified={!!user?.emailVerified}
      passkeys={passkeys}
      newName={newName}
      setNewName={setNewName}
      editingId={editingId}
      editingName={editingName}
      setEditingName={setEditingName}
      pendingId={pendingId}
      isLoading={isLoading}
      isSendingReset={isSendingReset}
      passwordResetSent={passwordResetSent}
      isSendingVerification={isSendingVerification}
      verificationSent={verificationSent}
      error={error}
      onAdd={() => void handleAdd()}
      onPasswordReset={() => void handlePasswordReset()}
      onEmailVerification={() => void handleEmailVerification()}
      onBeginRename={(passkey) => {
        setEditingId(passkey.id);
        setEditingName(passkey.name ?? '');
      }}
      onRename={(id) => void handleRename(id)}
      onDelete={(passkey) => void handleDelete(passkey)}
    />
  );
}
